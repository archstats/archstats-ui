// The highlight.js language for a file, by its name. The source view and the
// hover card's preview colour code with it.

export function detectLanguage(filename: string): string {
  const lowercaseFilename = filename.toLowerCase()
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  
  if (lowercaseFilename === 'makefile' || ext === 'mk') return 'makefile'
  if (lowercaseFilename === 'dockerfile' || ext === 'dockerfile') return 'dockerfile'
  
  if (ext === 'java') return 'java'
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return 'javascript'
  if (['ts', 'mts', 'cts', 'tsx'].includes(ext)) return 'typescript'
  if (ext === 'vue') return 'xml'
  if (ext === 'xml') return 'xml'
  if (ext === 'json') return 'json'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['html', 'htm', 'xhtml'].includes(ext)) return 'xml'
  if (ext === 'py') return 'python'
  if (ext === 'go') return 'go'
  if (ext === 'sql') return 'sql'
  if (['yaml', 'yml'].includes(ext)) return 'yaml'
  if (['sh', 'bash', 'zsh'].includes(ext)) return 'bash'
  if (['cpp', 'cc', 'cxx', 'hpp', 'h'].includes(ext)) return 'cpp'
  if (ext === 'c') return 'c'
  if (ext === 'cs') return 'csharp'
  if (ext === 'rs') return 'rust'
  if (ext === 'rb') return 'ruby'
  if (ext === 'php') return 'php'
  if (ext === 'swift') return 'swift'
  if (['kt', 'kts'].includes(ext)) return 'kotlin'
  if (ext === 'scala') return 'scala'
  if (ext === 'css') return 'css'
  if (ext === 'scss') return 'scss'
  if (ext === 'less') return 'less'
  if (['diff', 'patch'].includes(ext)) return 'diff'
  if (['toml', 'ini'].includes(ext)) return 'ini'
  if (ext === 'proto') return 'protobuf'
  if (['graphql', 'gql'].includes(ext)) return 'graphql'
  if (ext === 'pl' || ext === 'pm') return 'perl'
  if (ext === 'r') return 'r'
  
  return ''
}
