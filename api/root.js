const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  try {
    const htmlPath = path.join(process.cwd(), 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(200).send(html);
    }
  } catch (err) {
    console.error('Error serving index.html:', err);
  }
  return res.redirect(302, '/index.html');
};
