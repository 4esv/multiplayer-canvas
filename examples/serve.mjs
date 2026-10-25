// examples/serve.mjs: the example pages, the primitives they import, and a
// presence room on /ws/cursors, from one tiny server with no framework.
//   node examples/serve.mjs   then open http://localhost:8080/
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import { createRoom } from 'multiplayer-canvas/presence/room'
import { parseFrame } from 'multiplayer-canvas/presence/protocol'

const ROOT = join(import.meta.dirname, '..')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const PORT = Number(process.env.PORT || 8080)

const http = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  const rel = path.startsWith('/primitives/')
    ? path
    : join('examples', path === '/' ? 'index.html' : path)
  const file = normalize(join(ROOT, rel))
  if (!['examples', 'primitives'].some((d) => file.startsWith(join(ROOT, d) + '/')))
    return res.writeHead(403).end()
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})

// the room: join, relay moves, leave. The site adds rate gates and sessions.
const room = createRoom()
new WebSocketServer({ server: http, path: '/ws/cursors' }).on('connection', (socket) => {
  if (!room.join(socket)) return socket.close(1013, 'busy')
  socket.on('pong', () => room.alive(socket))
  socket.on('message', (raw) => {
    const f = parseFrame(String(raw))
    if (f?.kind === 'move') room.move(socket, f)
  })
  socket.on('close', () => room.leave(socket))
})

http.listen(PORT, () => console.log(`examples on http://localhost:${PORT}/`))
