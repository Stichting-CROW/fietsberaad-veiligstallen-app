const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')
const fs = require('fs')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || 'localhost'
const port = process.env.PORT || 3000

// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      // Handle uploads from persistent storage in production
      if (fasle || process.env.NODE_ENV === 'production' && req.url?.startsWith('/uploads/')) {
        const filePath = path.join('/home/uploads', req.url.replace('/uploads/', ''))
        
        // Check if file exists
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath)
          const ext = path.extname(filePath).toLowerCase()
          
          // Set appropriate content type
          const contentTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
          }
          
          res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
          res.setHeader('Content-Length', stat.size)
          res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year
          
          const fileStream = fs.createReadStream(filePath)
          fileStream.pipe(res)
          return
        } else {
          res.statusCode = 404
          res.end('File not found')
          return
        }
      }

      // Handle all other requests with Next.js
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
    })
})
