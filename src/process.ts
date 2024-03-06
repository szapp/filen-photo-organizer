import { Mutex } from 'async-mutex'
import exifr from 'exifr'
import FilenSDK, { FSStats, FileMetadata } from '@filen/sdk'
import { find } from 'geo-tz'
import convert from 'heic-jpg-exif'
import { DateTime } from 'luxon'
import { posix } from 'path'
import { v5 as uuidv5 } from 'uuid'

const UNIQUE_FILENAME_NAMESPACE = 'fa3d2ab8-2a92-44fd-96b7-1a85861159ae'

export default async function processFile(
  filen: FilenSDK,
  filePath: string,
  dirPattern: string = 'yyyy-MM',
  filePattern: string = 'yyyy-MM-dd_HH.mm.ss',
  writeAccess: Mutex,
  dryRun: boolean = false
): Promise<void> {
  const fileName: string = posix.basename(filePath)
  const rootPath: string = posix.dirname(filePath)
  let fileExt: string = posix.extname(fileName)

  try {
    // Only operate on files
    const stats: FSStats = await filen.fs().stat({
      path: filePath,
    })
    if (!stats.isFile()) return

    const useDateTime: boolean = dirPattern.length > 0 || filePattern.length > 0
    let dateTaken: DateTime
    let fileContents: Buffer
    let tz: string = DateTime.now().zoneName
    const { mime } = stats as FileMetadata

    // Look for date-created in EXIF metadata
    if (
      mime === 'image/jpeg' ||
      mime === 'image/png' ||
      mime === 'image/heic' ||
      mime === 'image/heif' ||
      mime === 'image/avif' ||
      mime === 'image/tiff'
    ) {
      // Read the file
      fileContents = await filen.fs().readFile({
        path: filePath,
      })

      // If no date-time related operations are desired, skip this block in favor of performance
      if (useDateTime) {
        // Retrieve time zone based off of GPS data
        try {
          const { latitude, longitude } = await exifr.gps(fileContents)
          const tzCandidates: string[] = find(latitude, longitude)
          if (tzCandidates.length > 0 && DateTime.now().setZone(tzCandidates[0]).isValid) {
            tz = tzCandidates[0]
          }
        } catch {
          // Fall back and assume default time zone
        }

        // Retrieve date-taken from EXIF (as raw string! exifr converts to Date in system time zone - which is incorrect here)
        const exifDate: string = (await exifr.parse(fileContents, { pick: ['DateTimeOriginal'], reviveValues: false }))?.DateTimeOriginal
        if (typeof exifDate === 'string') {
          // Parse string date: Either 'yyyy-MM-dd HH:mm:ss UTC' or 'yyyy:MM:dd HH:mm:ss'
          // eslint-disable-next-line quotes
          let exifDateParsed: DateTime = DateTime.fromFormat(exifDate, "yyyy-MM-dd HH:mm:ss 'UTC'", { zone: 'utc' }).setZone(tz)
          if (!exifDateParsed.isValid) {
            exifDateParsed = DateTime.fromFormat(exifDate, 'yyyy:MM:dd HH:mm:ss', { zone: tz })
          }
          // Fallback to only date and possibly omit time (yet mind UTC)
          if (!exifDateParsed.isValid) {
            const [year, month, day, hour, minute, second] = exifDate
              .trim()
              .split(/[-: ]/g)
              .map((ele) => (typeof ele === 'string' ? Number(ele) : undefined))
            exifDateParsed = DateTime.fromObject(
              { year, month, day, hour: hour ?? 12, minute, second },
              { zone: exifDate.search(/utc/i) ? 'utc' : tz }
            ).setZone(tz)
          }
          if (exifDateParsed.isValid) dateTaken = exifDateParsed
        }
      }
    }

    // Skip if no date-time related operations are desired
    if (useDateTime) {
      // Fall back to date in file name or file creation date or file modification date
      if (!dateTaken!) {
        const dateCreated: DateTime = DateTime.fromMillis(stats.birthtimeMs, { zone: 'utc' }).setZone(tz)
        const dateModified: DateTime = DateTime.fromMillis(stats.mtimeMs, { zone: 'utc' }).setZone(tz)
        const baseName: string = posix.basename(fileName, fileExt)
        const regex =
          /(?<!\d)(?<year>(?:19|20)?\d{2})(?:_|-|\.)?(?<month>0[1-9]|1[0-2])(?:_|-|\.)?(?<day>[0-3]\d)(?:_|-|\.)?(?<hour>[0-1][0-9]|2[0-4])?(?:_|-|\.)?(?<min>[0-6]\d)?(?:_|-|\.)?(?<sec>[0-6]\d)?/
        const match = baseName.match(regex)
        if (match) {
          interface ReDateMatch {
            year: string
            month: string
            day: string
            hour: string | undefined
            min: string | undefined
            sec: string | undefined
          }
          const res = match.groups as unknown as ReDateMatch
          const [yy, month, day, hour, minute, second] = Object.values(res).map((ele) =>
            typeof ele === 'string' ? Number(ele) : undefined
          )
          let year: number = Number(yy)
          if (year < 100) {
            const currentYear = Number(String(new Date().getFullYear()).substring(2))
            year += year > currentYear ? 1900 : 2000
          }
          // Ensure correct timezone for comparison
          const fileNameDate: DateTime = DateTime.fromObject({ year, month, day, hour: hour ?? 12, minute, second }, { zone: tz })

          // Cross-check if date matches file times
          const sameDayCreated: boolean = fileNameDate.hasSame(dateCreated, 'day')
          const sameDayModified: boolean = fileNameDate.hasSame(dateModified, 'day')
          if (sameDayCreated && sameDayModified) dateTaken = DateTime.min(dateCreated, dateModified)
          else if (sameDayCreated) dateTaken = dateCreated
          else if (sameDayModified) dateTaken = dateModified
          else dateTaken = fileNameDate
        } else {
          // Fall back to file creation or modification date - whichever is older
          dateTaken = DateTime.min(dateCreated, dateModified)
        }
      }
    }

    // Make path names
    const newDirName: string = dirPattern ? dateTaken!.toFormat(dirPattern) : ''
    const newDirPath: string = posix.join(rootPath, newDirName)
    let newBaseName: string = filePattern ? dateTaken!.toFormat(filePattern) : posix.basename(filePath, fileExt)

    // Convert HEIF
    if (mime === 'image/heic' || mime === 'image/heif') {
      fileContents = (await convert(fileContents!)) as Buffer
      fileExt = '.jpg'
    }

    // Check for existing files with the same name sequentially to avoid file name collisions
    const release = await writeAccess.acquire()
    try {
      // Check destination directory for files with matching file name
      let newDirContents: string[]
      try {
        newDirContents = await filen.fs().readdir({
          path: newDirPath,
        })
      } catch {
        newDirContents = []
      }
      const fileNamePattern: RegExp = new RegExp(`^${newBaseName}(?:_(?<index>\\d{3}))?${fileExt}$`)
      newDirContents = newDirContents.filter((item: string) => item.match(fileNamePattern)).sort()

      // If there are files with similar file name, check for identical files
      if (newDirContents.length > 0) {
        // Load the current file into memory for comparison
        if (!fileContents!) {
          fileContents = await filen.fs().readFile({
            path: filePath,
          })
        }

        // Check if the file is identical to any of the existing files
        let duplicate: boolean = false
        for (let idx = 0; idx < newDirContents.length; idx++) {
          const checkFileName = newDirContents[idx]
          const checkFileContents: Buffer = await filen.fs().readFile({
            path: posix.join(newDirPath, checkFileName),
          })
          // Files are identical: Abort and delete one
          if (!fileContents.compare(checkFileContents)) {
            console.log(`Delete '${fileName}', because it already exists: '${posix.join(newDirName, checkFileName)}'`)
            if (!dryRun) {
              await filen.fs().unlink({
                path: filePath,
                permanent: true,
              })
            }
            duplicate = true
            break
          }
        }
        if (duplicate) return

        // Find the next lowest available suffix index
        const idxCandidates: number[] = [...Array(newDirContents.length + 2).keys()]
        const idxTaken: number[] = newDirContents.map((item: string) => Number(item.match(fileNamePattern)?.groups?.index ?? '000'))
        const idxNext: number = Math.min(...idxCandidates.filter((x) => x && !idxTaken.includes(x)))
        newBaseName += '_' + String(idxNext).padStart(3, '0')
      }

      // Rename (move) or upload and delete (convert)
      const newFileName: string = `${newBaseName}${fileExt}`
      const newFileSubpath: string = posix.join(newDirName, newFileName)
      const newFilePath: string = posix.join(rootPath, newFileSubpath)
      if (mime === 'image/heic' || mime === 'image/heif') {
        console.log(`Convert '${fileName}' to '${newFileSubpath}'`)
        if (!dryRun) {
          await filen.fs().writeFile({
            content: fileContents!,
            path: newFilePath,
          })

          await filen.fs().unlink({
            path: filePath,
            permanent: false,
          })
        }
      } else {
        // Two-step process to prevent possible failure in filen-sdk if a file of the same name exists in the destication
        const tmpFileName: string = uuidv5(`${newBaseName}_${fileName}`, UNIQUE_FILENAME_NAMESPACE) + fileExt // Ensure reasonably short file path
        const tmpFileSubpath: string = posix.join(newDirName, tmpFileName)
        const tmpFilePath: string = posix.join(rootPath, tmpFileSubpath)
        console.log(`Move '${fileName}' to '${newFileSubpath}' (via '${tmpFileSubpath}')`)
        if (!dryRun) {
          // Rename file in-place and then move it to the destination
          await filen.fs().rename({
            from: filePath,
            to: tmpFilePath,
          })

          // Rename moved file in-place to final file name
          await filen.fs().rename({
            from: tmpFilePath,
            to: newFilePath,
          })
        }
      }
    } finally {
      release()
    }
  } catch (e) {
    const error: Error = e as Error
    console.log(`Error on '${fileName}': ${error?.message || error}`)
  }
}
