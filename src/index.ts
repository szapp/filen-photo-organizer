import { Mutex } from 'async-mutex'
import FilenSDK from '@filen/sdk'
import { DateTime, Settings } from 'luxon'
import * as OTPAuth from 'otpauth'
import { posix } from 'path'
import processFile from './process.js'

interface Return {
  numFiles: number
  numErrors: number
  errors: string[]
}

export default async function organizePhotos(
  credentials: { email: string; password: string; twoFactorCode: string | undefined; twoFactorSecret: string | undefined },
  rootPath: string,
  recursive: boolean = false,
  convertHeic: boolean = true,
  keepOriginals: boolean = false,
  destPath: string = '',
  dirPattern: string = 'yyyy-MM',
  filePattern: string = 'yyyy-MM-dd_HH.mm.ss',
  fallbackTimeZone: string = 'Europe/Berlin', // Filen.io location
  dryRun: boolean = false
): Promise<Return> {
  const filen: FilenSDK = new FilenSDK({
    metadataCache: true,
  })

  // Update time zone
  Settings.defaultZone = fallbackTimeZone
  if (DateTime.local().zoneName === null) throw new Error('Error: Invalid time zone. Please specify a valid IANA zone')

  // Prevent recursive infinite loop
  const potentialDestDir = posix.join(destPath, dirPattern)
  if (recursive && !potentialDestDir.startsWith('/') && !potentialDestDir.startsWith('..')) {
    throw new Error('Error: Destination cannot be inside the root directory when recursive is set to true')
  }

  // Report
  let numFiles: number = 0
  let numErrors: number = 0
  let errors: string[] = []

  try {
    await filen.login({
      email: credentials.email,
      password: credentials.password,
      twoFactorCode: credentials.twoFactorCode
        ? credentials.twoFactorCode
        : credentials.twoFactorSecret
          ? new OTPAuth.TOTP({ secret: credentials.twoFactorSecret }).generate()
          : undefined,
    })

    // Read directory
    let dirContents: string[] = await filen.fs().readdir({
      path: rootPath,
      recursive: recursive,
    })

    // Exclude directories by inspecting file extensions
    dirContents = dirContents.filter((name) => name.indexOf('.') !== -1).sort()

    // Individually process each file asynchronously
    // Nevertheless, create a mutex for writing operations to avoid file name collisions
    const writeAccess: Mutex = new Mutex(new Error('Something went wrong with the mutex!'))
    console.log(`Process ${dirContents.length} files in '${rootPath}'`)
    const processOutputs: PromiseSettledResult<void>[] = await Promise.allSettled(
      dirContents.map((fileName: string) =>
        processFile(filen, writeAccess, rootPath, fileName, destPath, dirPattern, filePattern, convertHeic, keepOriginals, dryRun)
      )
    )

    // Collect rate of success
    numFiles = dirContents.length
    errors = processOutputs
      .filter((p) => p.status === 'rejected')
      .reduce((out, p) => out.concat((p as PromiseRejectedResult).reason), [])
      .map((r) => (r as Error)?.message ?? String(r))
    numErrors = errors.length
  } finally {
    filen.logout()
    filen.clearTemporaryDirectory()
  }

  console.log(`Done (${numFiles - numErrors}/${numFiles} files succeeded)`)

  return { numFiles, numErrors, errors }
}

module.exports = organizePhotos
