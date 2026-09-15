import { StreamLanguage } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/** hosts 行语法：注释 / IPv4 / IPv6 / 主机名 */
export const hostsLanguage = StreamLanguage.define({
  name: 'hosts',
  token(stream) {
    if (stream.match(/^\s*#.*/)) return 'comment'
    if (stream.match(/\s+#.*/)) return 'comment'
    if (
      stream.match(
        /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)/
      )
    ) {
      return 'number'
    }
    if (stream.match(/^(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}/)) return 'number'
    if (stream.match(/^[A-Za-z0-9][A-Za-z0-9._-]*/)) return 'string'
    if (stream.eatSpace()) return null
    stream.next()
    return null
  },
  tokenTable: {
    comment: t.comment,
    number: t.number,
    string: t.string
  }
})
