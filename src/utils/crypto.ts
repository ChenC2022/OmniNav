/** 使用 SHA-256 哈希，用于私密分类密码校验（categoryId + password 避免彩虹表） */
export async function hashPassword(categoryId: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(categoryId + '\0' + password)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
