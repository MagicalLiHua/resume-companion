export function redactBrowserText(value: string): string {
  // AX controls may be unnamed, with the label in an adjacent StaticText node.
  // Malformed values must not escape merely because they no longer match a
  // normal phone/email pattern (for example after an accidental append).
  let precedingSensitiveLabel = '';
  const semantic = value.split('\n').map(line => {
    const label = line.match(/(?:StaticText|textbox|combobox|spinbutton)\s+"([^"]*)"/i)?.[1] ?? '';
    const sensitive = /(手机号|手机号码|电话|邮箱|身份证|证件|护照|银行卡|出生日期|出生年月|生日|住址|家庭地址|账号|\bphone\b|\be-?mail\b|passport)/i;
    const context = sensitive.test(label) ? label : !label ? precedingSensitiveLabel : '';
    if (/\bStaticText\b/.test(line)) precedingSensitiveLabel = sensitive.test(label) ? label : '';
    if (/\b(textbox|combobox|spinbutton)\b/.test(line)) {
      precedingSensitiveLabel = '';
      if (context) return line.replace(/(\bvalue=")([^"]*)(")/g, (_match, prefix, raw: string, suffix) => {
        const valid = /邮箱|\be-?mail\b/i.test(context) ? /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(raw)
          : /电话|手机|\bphone\b/i.test(context) ? /^1\d{10}$/.test(raw)
          : /身份证|证件|护照|银行卡|passport/i.test(context) ? /^(?:\d{15}|\d{17}[\dXx]|\d{16,19})$/.test(raw) : false;
        return `${prefix}${!raw || valid ? raw : '<masked>'}${suffix}`;
      });
    }
    return line;
  }).join('\n');
  return semantic
    .replace(/([\w.+-]{1,64})@([\w.-]+\.[A-Za-z]{2,})/g, (_match, name: string, domain: string) => `${name.slice(0, Math.min(2, name.length))}******@${domain}`)
    .replace(/(?<!\d)(1\d{2})\d{4}(\d{4})(?!\d)/g, '$1****$2')
    .replace(/(?<!\d)(\d{3})\d{11}([\dXx]{4})(?![\dXx])/g, '$1***********$2')
    .replace(/(?<!\d)(\d{3})\d{8}(\d{4})(?!\d)/g, '$1********$2')
    .replace(/(?<!\d)(\d{4})\d{8,11}(\d{4})(?!\d)/g, '$1********$2')
    .replace(/(?<!\d)\d{12,}(?!\d)/g, '<masked>')
    .replace(/((?:出生日期|出生年月|生日)[^\n]{0,180}?value=")[^"]+(")/gi, '$1<masked>$2');
}
