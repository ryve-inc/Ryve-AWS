/**
 * MIME type inference and text buffer detection utilities.
 */

export function inferMimeType(name: string, fallbackMime: string | null): string {
  if (fallbackMime && fallbackMime !== 'application/octet-stream') return fallbackMime
  const ext = name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    // Images
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg':
    case 'jpe':
    case 'jfif':
    case 'pjpeg':
    case 'pjp': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg':
    case 'svgz': return 'image/svg+xml'
    case 'bmp':
    case 'dib': return 'image/bmp'
    case 'ico':
    case 'cur': return 'image/x-icon'
    case 'avif': return 'image/avif'
    case 'apng': return 'image/apng'
    case 'tif':
    case 'tiff': return 'image/tiff'

    // Videos
    case 'mp4':
    case 'm4v': return 'video/mp4'
    case 'webm': return 'video/webm'
    case 'mkv': return 'video/webm' // EBML container compatibility in Chromium
    case 'mov':
    case 'qt': return 'video/mp4'
    case 'ogv': return 'video/ogg'
    case 'avi': return 'video/x-msvideo'
    case 'wmv': return 'video/x-ms-wmv'
    case 'flv':
    case 'f4v': return 'video/x-flv'
    case 'm2ts': return 'video/mp2t'
    case '3gp': return 'video/3gpp'
    case '3g2': return 'video/3gpp2'
    case 'mpg':
    case 'mpeg':
    case 'mpe':
    case 'mpv':
    case 'm2v':
    case 'vob': return 'video/mpeg'

    // Audio
    case 'mp3': return 'audio/mpeg'
    case 'wav':
    case 'wave': return 'audio/wav'
    case 'ogg':
    case 'oga':
    case 'opus': return 'audio/ogg'
    case 'aac': return 'audio/aac'
    case 'm4a': return 'audio/mp4'
    case 'flac': return 'audio/flac'
    case 'weba': return 'audio/webm'
    case 'wma': return 'audio/x-ms-wma'
    case 'aiff':
    case 'aif':
    case 'aifc': return 'audio/aiff'
    case 'mid':
    case 'midi': return 'audio/midi'
    case 'amr': return 'audio/amr'
    case 'ac3': return 'audio/ac3'
    case 'eac3': return 'audio/eac3'

    // PDF
    case 'pdf': return 'application/pdf'

    // Text & Code
    case 'txt':
    case 'text':
    case 'log':
    case 'err':
    case 'out':
    case 'msg':
    case 'nfo':
    case 'rtf':
    case 'conf':
    case 'cfg':
    case 'ini':
    case 'env':
    case 'properties':
    case 'gitignore':
    case 'gitattributes':
    case 'dockerignore':
    case 'editorconfig': return 'text/plain'

    case 'md':
    case 'markdown':
    case 'mdown':
    case 'mkdn':
    case 'rst':
    case 'tex':
    case 'asciidoc':
    case 'adoc': return 'text/markdown'

    case 'json':
    case 'jsonc':
    case 'json5': return 'application/json'

    case 'js':
    case 'mjs':
    case 'cjs': return 'text/javascript'

    case 'ts':
    case 'mts':
    case 'cts':
    case 'tsx':
    case 'jsx': return 'text/typescript'

    case 'html':
    case 'htm':
    case 'xhtml':
    case 'shtml':
    case 'vue':
    case 'svelte': return 'text/html'

    case 'css':
    case 'scss':
    case 'sass':
    case 'less': return 'text/css'

    case 'csv':
    case 'tsv':
    case 'tab': return 'text/csv'

    case 'py':
    case 'pyw':
    case 'ipynb': return 'text/x-python'

    case 'sh':
    case 'bash':
    case 'zsh':
    case 'ksh':
    case 'csh':
    case 'tcsh':
    case 'fish':
    case 'bat':
    case 'cmd':
    case 'ps1':
    case 'psm1': return 'text/x-sh'

    case 'rs': return 'text/rust'
    case 'go': return 'text/x-go'
    case 'c':
    case 'h': return 'text/x-c'
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hxx': return 'text/x-c++'
    case 'cs':
    case 'csx': return 'text/x-csharp'
    case 'java':
    case 'kt':
    case 'kts': return 'text/x-java'
    case 'swift': return 'text/x-swift'
    case 'd':
    case 'dart': return 'text/x-dart'
    case 'lua': return 'text/x-lua'
    case 'pl':
    case 'pm': return 'text/x-perl'
    case 'r':
    case 'rmd': return 'text/x-r'
    case 'sql': return 'text/x-sql'
    case 'rb': return 'text/x-ruby'
    case 'php':
    case 'phtml': return 'text/x-php'
    case 'xml': return 'text/xml'
    case 'yaml':
    case 'yml': return 'text/yaml'
    case 'toml': return 'text/x-toml'
    case 'diff':
    case 'patch': return 'text/x-diff'
    case 'proto': return 'text/x-protobuf'
    case 'graphql':
    case 'gql': return 'text/x-graphql'
    case 'zig': return 'text/x-zig'
    case 'nim': return 'text/x-nim'
    case 'clj':
    case 'cljs':
    case 'edn': return 'text/x-clojure'
    case 'ex':
    case 'exs': return 'text/x-elixir'
    case 'erl':
    case 'hrl': return 'text/x-erlang'
    case 'hs':
    case 'lhs': return 'text/x-haskell'
    case 'ml':
    case 'mli': return 'text/x-ocaml'
    case 'fs':
    case 'fsi':
    case 'fsx': return 'text/x-fsharp'
    case 'v':
    case 'sv':
    case 'vhd':
    case 'vhdl': return 'text/x-hdl'
    case 'asm':
    case 's': return 'text/x-asm'

    default: return fallbackMime || 'application/octet-stream'
  }
}

export function isBufferText(buf: Uint8Array): boolean {
  const len = Math.min(buf.byteLength, 4096)
  if (len === 0) return true
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return false
  }
  return true
}

