const organizePhotos = require('../')
const config = require('./local.json')

const main = async () => {
  await organizePhotos(config.credentials, config.rootPath, config.dirPattern, config.filePattern, config.fallbackTimeZone, true)
}

main()
