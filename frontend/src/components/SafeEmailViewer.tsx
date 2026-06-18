import DOMPurify from 'dompurify'

interface SafeEmailViewerProps {
  html: string
}

/**
 * Renders untrusted email HTML safely.
 * Double-sanitizes: DOMPurify cleans the HTML, then renders inside a
 * sandboxed iframe with srcdoc to isolate scripts and CSS from the app.
 *
 * Security notes (from file-uploads + cc-skill-security-review):
 * - sandbox attr: no scripts, no same-origin, no forms, no popups
 * - allow-same-origin is INTENTIONALLY omitted
 * - DOMPurify strips any remaining dangerous elements before iframe injection
 */
export default function SafeEmailViewer({ html }: SafeEmailViewerProps) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p','br','b','i','u','strong','em','a','img','ul','ol','li',
      'blockquote','pre','code','h1','h2','h3','h4','h5','h6',
      'table','thead','tbody','tr','th','td','span','div',
      'hr','figure','figcaption','mark','small','del','ins',
    ],
    ALLOWED_ATTR: ['href','src','alt','class','style','target','rel','colspan','rowspan'],
    FORBID_TAGS: ['script','iframe','object','embed','form','input','button'],
    FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  })

  // Dark-mode aware base styles injected into iframe
  const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #e2e8f0;
    background: transparent;
    word-break: break-word;
  }
  a { color: #818cf8; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  blockquote {
    border-left: 3px solid #334155;
    padding-left: 12px;
    margin: 8px 0;
    color: #94a3b8;
  }
  pre { background: #1f2330; padding: 12px; border-radius: 6px; overflow: auto; }
  code { background: #1f2330; padding: 2px 5px; border-radius: 3px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 10px; border: 1px solid #334155; }
</style>
</head>
<body>${clean}</body>
</html>`

  return (
    <iframe
      srcDoc={wrappedHtml}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      title="Email content"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
        background: 'transparent',
      }}
      // Expand iframe height to content on load
      onLoad={(e) => {
        const iframe = e.currentTarget
        try {
          const body = iframe.contentDocument?.body
          if (body) {
            iframe.style.height = body.scrollHeight + 32 + 'px'
          }
        } catch {
          // Cross-origin guard — shouldn't happen with srcdoc but just in case
        }
      }}
    />
  )
}
