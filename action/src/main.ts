import * as core from '@actions/core'
import organizePhotos from '../../'

async function run(): Promise<void> {
  const credentials: {
    email: string
    password: string
    twoFactorCode: string
    twoFactorSecret: string
  } = {
    email: core.getInput('email', { required: true }),
    password: core.getInput('password', { required: true, trimWhitespace: false }),
    twoFactorCode: core.getInput('twoFactorCode'),
    twoFactorSecret: core.getInput('twoFactorSecret'),
  }
  const rootPath: string = core.getInput('rootPath', { required: true })
  const recursive: boolean = core.getBooleanInput('recursive')
  const destPath: string = core.getInput('destinationPath')
  const dirPattern: string = core.getInput('dirPattern')
  const filePattern: string = core.getInput('filePattern')
  const fallbackTimeZone: string = core.getInput('fallbackTimeZone')
  const keepOriginals: boolean = core.getBooleanInput('keepOriginals')
  const dryRun: boolean = core.getBooleanInput('dryRun')

  let result: { numFiles: number; numErrors: number; errors: string[] }
  try {
    result = await organizePhotos(
      credentials,
      rootPath,
      recursive,
      destPath,
      dirPattern,
      filePattern,
      fallbackTimeZone,
      keepOriginals,
      dryRun
    )
  } catch (error) {
    if (!(error instanceof Error)) error = new Error(String(error))
    core.setFailed(error as Error)
    return
  }
  const { numFiles, numErrors, errors } = result

  // Report only one general error
  if (numErrors) core.setFailed(`Failed to process ${numErrors} file${numErrors !== 1 ? 's' : ''}`)

  // Create job summary
  if (!core.summary.isEmptyBuffer()) {
    core.summary.addSeparator()
    core.summary.addHeading('Organize photos', '1')
  }
  core.summary.addRaw(`Processed ${numFiles} file${numFiles !== 1 ? 's' : ''} with ${numErrors} error${numErrors !== 1 ? 's' : ''}`, true)
  core.summary.addList(errors, false)
  core.summary.write({ overwrite: false })
}

run()
