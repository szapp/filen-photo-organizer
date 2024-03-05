import { Mutex } from 'async-mutex'
import exifr from 'exifr'
import FilenSDK, { FSStats, FileMetadata } from '@filen/sdk'
import convert from 'heic-jpg-exif'
import { DateTime } from 'luxon'
import { posix } from 'path'

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

    let dateTaken: DateTime
    let fileContents: Buffer
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

      // Retrieve date-taken from EXIF
      const exifDate: Date = (await exifr.parse(fileContents, ['DateTimeOriginal']))?.DateTimeOriginal
      if (typeof exifDate !== 'undefined') dateTaken = DateTime.fromJSDate(exifDate, { zone: 'utc' }).toLocal()
    }

    // Fall back to date in file name or file creation date or file modification date
    if (!dateTaken!) {
      const dateCreated: DateTime = DateTime.fromMillis(stats.birthtimeMs, { zone: 'utc' }).toLocal()
      const dateModified: DateTime = DateTime.fromMillis(stats.mtimeMs, { zone: 'utc' }).toLocal()
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
        const { year: yy, month, day, hour, min, sec } = match.groups as unknown as ReDateMatch
        let year: number = Number(yy)
        if (year < 100) {
          const currentYear = Number(String(new Date().getFullYear()).substring(2))
          year += year > currentYear ? 1900 : 2000
        }
        // Ensure correct timezone for comparison
        const fileNameDate: DateTime = DateTime.fromISO(`${year}-${month}-${day}T${hour ?? '12'}:${min ?? '00'}:${sec ?? '00'}`)

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

    // Make path names
    const newDirName: string = dirPattern ? dateTaken.toFormat(dirPattern) : ''
    const newDirPath: string = posix.join(rootPath, newDirName)
    let newBaseName: string = filePattern ? dateTaken.toFormat(filePattern) : posix.basename(filePath, fileExt)

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
        // Three-step process to prevent possible failure in filen-sdk if a file of the same name exists in the destication
        const tmpFileName: string = `${newBaseName}_${fileName}`
        const tmpFilePath1: string = posix.join(rootPath, tmpFileName)
        const tmpFileSubpath2: string = posix.join(newDirName, tmpFileName)
        const tmpFilePath2: string = posix.join(rootPath, tmpFileSubpath2)
        console.log(`Move '${fileName}' to '${newFileSubpath}'`)
        if (!dryRun) {
          // Rename file within same folder
          await filen.fs().rename({
            from: filePath,
            to: tmpFilePath1,
          })

          // Move renamed file into destination folder
          await filen.fs().rename({
            from: tmpFilePath1,
            to: tmpFilePath2,
          })

          // Read directory contents in-between to avoid zero-size files
          newDirContents = await filen.fs().readdir({
            path: newDirPath,
          })

          // Rename renamed file in destination folder to final file name
          await filen.fs().rename({
            from: tmpFilePath2,
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
