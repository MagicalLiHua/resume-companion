export function redactBrowserText(value: string): string {
  return value
    .replace(/([\w.+-]{1,64})@([\w.-]+\.[A-Za-z]{2,})/g, (_match, name: string, domain: string) => `${name.slice(0, Math.min(2, name.length))}******@${domain}`)
    .replace(/(?<!\d)(1\d{2})\d{4}(\d{4})(?!\d)/g, '$1****$2')
    .replace(/(?<!\d)(\d{3})\d{11}([\dXx]{4})(?![\dXx])/g, '$1***********$2')
    .replace(/(?<!\d)(\d{3})\d{8}(\d{4})(?!\d)/g, '$1********$2')
    .replace(/(?<!\d)(\d{4})\d{8,11}(\d{4})(?!\d)/g, '$1********$2')
    .replace(/((?:出生日期|出生年月|生日)[^\n]{0,180}?value=")[^"]+(")/gi, '$1<masked>$2');
}
