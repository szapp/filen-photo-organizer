import { Mutex } from 'async-mutex'
import fs from 'fs'
import { DateTime, Settings } from 'luxon'
import { posix } from 'path'
import processFile from './process.js'

interface Return {
  numFiles: number
  numErrors: number
  errors: string[]
}

export default async function organizePhotos(
  rootPath: string,
  dirPattern: string = 'yyyy-MM',
  filePattern: string = 'yyyy-MM-dd_HH.mm.ss',
  fallbackTimeZone: string = 'Europe/Berlin',
  dryRun: boolean = false
): Promise<Return> {
  // Replace environment variables in path
  rootPath = rootPath.replace(/%([^%]+)%/g, (full, name) => process.env[name] || full)

  // Update time zone
  Settings.defaultZone = fallbackTimeZone
  if (DateTime.local().zoneName === null) throw new Error('Error: Invalid time zone. Please specify a valid IANA zone')

  // Report
  let numFiles: number = 0
  let numErrors: number = 0
  let errors: string[] = []

  try {
    // Read directory
    let dirContents: string[] = fs.readdirSync(rootPath)

    // Exclude directories by inspecting file extensions
    dirContents = dirContents.filter((name) => name.indexOf('.') !== -1).sort()

    // Individually process each file asynchronously
    // Nevertheless, create a mutex for writing operations to avoid file name collisions
    const writeAccess: Mutex = new Mutex(new Error('Something went wrong with the mutex!'))
    console.log(`Process ${dirContents.length} files in '${rootPath}'`)
    const processOutputs: PromiseSettledResult<void>[] = await Promise.allSettled(
      dirContents.map((fileName: string) => processFile(posix.join(rootPath, fileName), dirPattern, filePattern, writeAccess, dryRun))
    )

    // Collect rate of success
    numFiles = dirContents.length
    errors = processOutputs
      .filter((p) => p.status === 'rejected')
      .reduce((out, p) => out.concat((p as PromiseRejectedResult).reason), [])
      .map((r) => (r as Error)?.message ?? String(r))
    numErrors = errors.length
  } finally {
    // Reset
  }

  console.log(`Done (${numFiles - numErrors}/${numFiles} files succeeded)`)

  return { numFiles, numErrors, errors }
}

module.exports = organizePhotos
