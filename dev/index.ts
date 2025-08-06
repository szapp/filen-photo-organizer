import organizePhotos from '../src'
import config from './local.json'

const main = async () => {
  await organizePhotos(config.credentials, config.rootPath, config.dirPattern, config.filePattern, false)
}

main()
