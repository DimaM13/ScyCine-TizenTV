import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const outputFile = path.resolve(rootDir, 'SkyCine-TizenTV.wgt');

async function packageWgt() {
  console.log('Packaging SkyCine-TizenTV.wgt for Samsung Smart TV...');

  if (!fs.existsSync(distDir)) {
    console.error('Error: dist/ directory does not exist! Please run "npm run build" first.');
    process.exit(1);
  }

  // Copy config.xml, icon.png, and style.css into dist/ before packaging
  const configSource = path.resolve(rootDir, 'config.xml');
  const iconSource = path.resolve(rootDir, 'icon.png');
  const cssSource = path.resolve(rootDir, 'src', 'style.css');
  
  if (fs.existsSync(configSource)) {
    fs.copyFileSync(configSource, path.resolve(distDir, 'config.xml'));
    console.log('Copied config.xml to dist/');
  }
  if (fs.existsSync(iconSource)) {
    fs.copyFileSync(iconSource, path.resolve(distDir, 'icon.png'));
    console.log('Copied icon.png to dist/');
  }
  if (fs.existsSync(cssSource)) {
    fs.copyFileSync(cssSource, path.resolve(distDir, 'style.css'));
    console.log('Copied style.css to dist/');
  }

  // Ensure dist/index.html is 100% compatible with Tizen 5.0 (Chrome 56/63 file:/// loading)
  const distHtmlPath = path.resolve(distDir, 'index.html');
  if (fs.existsSync(distHtmlPath)) {
    let html = fs.readFileSync(distHtmlPath, 'utf-8');
    
    // 1. Remove any crossorigin attributes which fail on local file:/// in Chromium 56/63
    html = html.replace(/\scrossorigin(=["'][^"']*["'])?/gi, '');
    
    // 2. Ensure style.css is linked in <head>
    if (!html.includes('href="./style.css"') && !html.includes('href="style.css"')) {
      html = html.replace('</head>', '  <link rel="stylesheet" href="./style.css">\n  </head>');
    }

    // 3. Find legacy polyfill and legacy entry script
    const polyfillMatch = html.match(/src="([^"]*polyfills-legacy-[^"]*\.js)"/);
    const entryMatch = html.match(/data-src="([^"]*index-legacy-[^"]*\.js)"/);
    
    if (polyfillMatch && entryMatch) {
      const polyfillSrc = polyfillMatch[1];
      const entrySrc = entryMatch[1];
      
      // Directly load polyfills, load script tag (populates System.register), then System.import with error trap
      const replacement = `    <script id="vite-legacy-polyfill" src="${polyfillSrc}"></script>
    <script id="vite-legacy-script" src="${entrySrc}"></script>
    <script id="vite-legacy-entry">
      System.import('${entrySrc}')
        .then(function() {
          console.log('[SkyCine TV Loader] System.import completed successfully.');
        })
        .catch(function(err) {
          console.error('[SkyCine TV Loader] System.import error:', err);
          if (window.onerror) {
            window.onerror(String(err), '${entrySrc}', 0, 0, err);
          }
        });
    </script>
  </body>`;
      
      html = html.replace(/<script[^>]*id="vite-legacy-polyfill"[\s\S]*?<\/body>/i, replacement);
      fs.writeFileSync(distHtmlPath, html, 'utf-8');
      console.log('Optimized dist/index.html for Samsung Tizen 5.0 (Chromium 56/63)');
    }
  }

  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    const sizeMb = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`Successfully created: ${outputFile} (${sizeMb} MB)`);
    console.log('Ready for installation on Samsung Smart TV via USB or "sdb install SkyCine-TizenTV.wgt"!');
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(distDir, false);
  await archive.finalize();
}

packageWgt().catch(err => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
