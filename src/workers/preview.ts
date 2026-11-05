import b4a from 'b4a'
import { inferMimeType, isBufferText } from './mime'

export interface PreviewResult {
  supported: boolean
  mime: string
  name: string
  byteLength: number
  isText?: boolean
  content?: string
  data?: string
}

export function formatFilePreview({
  buffer,
  rawMime,
  name
}: {
  buffer: Uint8Array
  rawMime: string | null
  name: string
}): PreviewResult {
  const mime = inferMimeType(name, rawMime)
  const ext = name.split('.').pop()?.toLowerCase() || ''

  const isImage =
    mime.startsWith('image/') ||
    /\.(png|jpe?g|jpe|jfif|pjpeg|pjp|gif|webp|svg|svgz|bmp|dib|ico|cur|avif|apng|tif|tiff)$/i.test(name)
  const isVideo =
    mime.startsWith('video/') ||
    /\.(mp4|m4v|mkv|webm|mov|qt|avi|wmv|flv|f4v|ts|m2ts|mts|3gp|3g2|ogv|ogg|mpg|mpeg|mpe|mpv|m2v|vob)$/i.test(name)
  const isAudio =
    mime.startsWith('audio/') ||
    /\.(mp3|wav|wave|ogg|oga|opus|aac|flac|m4a|weba|wma|aiff|aif|aifc|mid|midi|amr|ac3|eac3)$/i.test(name)
  const isPdf = mime === 'application/pdf' || ext === 'pdf'

  const isTextByExt =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|text|log|err|out|msg|nfo|rtf|conf|cfg|ini|env|properties|gitignore|gitattributes|dockerignore|editorconfig|md|markdown|mdown|mkdn|rst|tex|asciidoc|adoc|json|jsonc|json5|js|mjs|cjs|ts|mts|cts|tsx|jsx|html|htm|xhtml|shtml|vue|svelte|css|scss|sass|less|csv|tsv|tab|py|pyw|ipynb|sh|bash|zsh|ksh|csh|tcsh|fish|bat|cmd|ps1|psm1|rs|go|c|h|cpp|cc|cxx|hpp|hxx|cs|csx|java|kt|kts|swift|d|dart|lua|pl|pm|r|rmd|sql|rb|php|phtml|xml|yaml|yml|toml|diff|patch|proto|graphql|gql|zig|nim|clj|cljs|edn|ex|exs|erl|hrl|hs|lhs|ml|mli|fs|fsi|fsx|v|sv|vhd|vhdl|asm|s)$/i.test(
      name
    )

  const isText = isTextByExt || isBufferText(buffer)
  const supported = isImage || isVideo || isAudio || isPdf || isText

  if (!supported) {
    return {
      supported: false,
      mime,
      name,
      byteLength: buffer.byteLength
    }
  }

  if (isText) {
    let textContent: string
    try {
      textContent = b4a.toString(buffer, 'utf-8')
    } catch {
      textContent = ''
    }
    return {
      supported: true,
      isText: true,
      content: textContent,
      mime: mime.startsWith('text/') ? mime : 'text/plain',
      name,
      byteLength: buffer.byteLength
    }
  }

  const base64Data = b4a.toString(buffer, 'base64')
  return {
    supported: true,
    isText: false,
    data: base64Data,
    mime,
    name,
    byteLength: buffer.byteLength
  }
}

