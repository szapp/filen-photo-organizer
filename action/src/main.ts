import * as core from '@actions/core'
import organizePhotos from '../../'

async function run(): Promise<void> {
  const credentials: {
    email: string
    password: string
    twoFactorCode: string
  } = {
    email: core.getInput('email', { required: true }),
    password: core.getInput('password', { required: true, trimWhitespace: false }),
    twoFactorCode: core.getInput('twoFactorCode'),
  }
  const rootPath: string = core.getInput('rootPath', { required: true })
  const dirPattern: string = core.getInput('dirPattern')
  const filePattern: string = core.getInput('filePattern')
  const dryRun: boolean = core.getBooleanInput('dryRun')
  await organizePhotos(credentials, rootPath, dirPattern, filePattern, dryRun)
}

run()
