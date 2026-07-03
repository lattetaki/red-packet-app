export function isValidPasswordValue(password: string) {
  return /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]{6,20}$/.test(password)
}
