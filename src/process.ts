import { Mutex } from 'async-mutex'
import exifr from 'exifr'
import FilenSDK, { FSStats, FileMetadata } from '@filen/sdk'
import fs from 'fs'
import { find } from 'geo-tz'
import convert from 'heic-jpg-exif'
import { DateTime } from 'luxon'
import os from 'os'
import { posix } from 'path'
import { v5 as uuidv5 } from 'uuid'

const UNIQUE_FILENAME_NAMESPACE = 'fa3d2ab8-2a92-44fd-96b7-1a85861159ae'

export default async function processFile(
  filen: FilenSDK,
  filePath: string,
  dirPattern: string = 'yyyy-MM',
  filePattern: string = 'yyyy-MM-dd_HH.mm.ss',
  keepOriginals: boolean = false,
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
    let tz: string = DateTime.now().zoneName
    let { mime } = stats as FileMetadata

    // If no date-time related operations are desired, skip this block in favor of performance
    if (dirPattern.length > 0 || filePattern.length > 0) {
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

        // Retrieve date-taken and time zone based off of EXIF data
        // As raw string! exifr converts to Date in system time zone - which is incorrect here
        const meta = await exifr.parse(fileContents, {
          pick: ['DateTimeOriginal', 'OffsetTimeOriginal'],
          reviveValues: false,
        })
        const exifDate: string | undefined = meta?.DateTimeOriginal
        const tzOffset: string | undefined = meta?.OffsetTimeOriginal

        // Obtain time zone
        if (typeof tzOffset === 'string' && tzOffset.match(/^[+-]\d{2}:\d{2}$/) && DateTime.now().setZone(`utc${tzOffset}`).isValid) {
          tz = `utc${tzOffset}`
        } else {
          // Otherwise retrieve time zone based off of GPS data (EXIF < 2.31 does not support OffsetTimeOriginal)
          try {
            const { latitude, longitude } = await exifr.gps(fileContents)
            const tzCandidates: string[] = find(latitude, longitude)
            if (tzCandidates.length > 0 && DateTime.now().setZone(tzCandidates[0]).isValid) {
              tz = tzCandidates[0]
            }
          } catch {
            // Fall back and assume default time zone
          }
        }

        // Parse date-taken
        if (typeof exifDate === 'string') {
          // Parse string date according to EXIF specifications 'yyyy:MM:dd HH:mm:ss'. Just in case also test for 'yyyy-MM-dd HH:mm:ss'
          let exifDateParsed: DateTime = DateTime.fromFormat(exifDate, 'yyyy:MM:dd HH:mm:ss', { zone: tz })
          if (!exifDateParsed.isValid) {
            exifDateParsed = DateTime.fromFormat(exifDate, 'yyyy-MM-dd HH:mm:ss', { zone: tz })
          }
          // Fallback to only date and possibly omit time (unlikely)
          if (!exifDateParsed.isValid) {
            const [year, month, day, hour, minute, second] = exifDate
              .trim()
              .split(/[-: ]/g)
              .map((ele) => (typeof ele === 'string' ? Number(ele) : undefined))
            if (typeof year !== 'undefined' && month && day) {
              exifDateParsed = DateTime.fromObject({ year, month, day, hour: hour ?? 12, minute, second }, { zone: tz })
            }
          }
          if (exifDateParsed.isValid) dateTaken = exifDateParsed
        }
      }

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
      try {
        fileContents = (await convert(fileContents!)) as Buffer
      } catch (e) {
        if (!(e instanceof Error) || (e as Error)?.message !== 'Input is already a JPEG image') throw e
        mime = 'image/jpeg'
      }
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
          // Files are identical: Abort and skip/delete one
          if (!fileContents.compare(checkFileContents)) {
            const operation = keepOriginals ? 'Skip' : 'Delete'
            console.log(`${operation} '${fileName}', because it already exists as '${posix.join(newDirName, checkFileName)}'`)
            if (!dryRun && !keepOriginals) {
              await filen.fs().unlink({
                path: filePath,
                permanent: false,
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
          // In order to retain the modification date, write the file locally, upload it, and delete the local file
          const localTmpDirPath: string = posix.join(filen.config.tmpPath || os.tmpdir(), 'filen-sdk', 'filen-photo-organizer')
          const localTmpFilePath: string = posix.join(localTmpDirPath, uuidv5(filePath, UNIQUE_FILENAME_NAMESPACE))
          if (!fs.existsSync(localTmpDirPath)) fs.mkdirSync(localTmpDirPath, { recursive: true })
          fs.writeFileSync(localTmpFilePath, fileContents!)
          fs.utimesSync(localTmpFilePath, stats.birthtimeMs / 1000, stats.mtimeMs / 1000)
          await filen.fs().upload({
            path: newFilePath,
            source: localTmpFilePath,
          })
          fs.unlinkSync(localTmpFilePath)

          if (!keepOriginals) {
            await filen.fs().unlink({
              path: filePath,
              permanent: false,
            })
          }
        }
      } else {
        const operation = keepOriginals ? 'Copy' : 'Move'
        console.log(`${operation} '${fileName}' to '${newFileSubpath}'`)
        if (!dryRun) {
          if (keepOriginals) {
            await filen.fs().copy({
              from: filePath,
              to: newFilePath,
            })
          } else {
            await filen.fs().rename({
              from: filePath,
              to: newFilePath,
            })
          }
        }
      }
    } finally {
      release()
    }
  } catch (e) {
    // Format, print, and throw (reject promise)
    let message: string
    if (e instanceof Error) {
      const err: Error = e as Error
      message = `${err?.message || e}`
      if (err?.name !== 'Error') message += ` (${err?.name})`
    } else {
      message = String(e)
    }
    const error: Error = new Error(`Error for '${fileName}': ${message}`)
    console.error(error.message)
    try {
      error.stack = undefined
    } catch {
      // If stack not supported
    }
    throw error
  }
}
