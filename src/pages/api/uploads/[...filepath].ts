import type { NextApiRequest, NextApiResponse } from "next";
import fs from 'fs';
import path from 'path';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  try {
    // Extract the file path from the URL
    const { filepath } = req.query;
    
    if (!filepath || !Array.isArray(filepath) || filepath.length === 0) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    // Join the filepath array into a single path string
    const filePathString = filepath.join('/');

    // In production, files are stored in /home/uploads
    // In development, they're in public/uploads
    const baseDir = process.env.NODE_ENV === 'production' 
      ? '/home/uploads' 
      : path.join(process.cwd(), 'public/uploads');
    
    const fullPath = path.join(baseDir, filePathString);

    // Security check: ensure the path is within the uploads directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedBaseDir = path.resolve(baseDir);
    
    if (!resolvedPath.startsWith(resolvedBaseDir)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Get file stats
    const stat = fs.statSync(resolvedPath);
    
    // Set appropriate content type based on file extension
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Last-Modified', stat.mtime.toUTCString());

    // Stream the file
    const fileStream = fs.createReadStream(resolvedPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default handler;
