import config from '../config'
import server from '../src/recordApp/server/main'
import _debug from 'debug'

const debug = _debug('app:bin:server')
const port = config.server_port
const host = config.server_host

server.listen(port)
debug(`Server is now running at ${host}:${port}.`)
