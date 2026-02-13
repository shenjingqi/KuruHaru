class UrlConstructor {
  constructor() {
    this.baseUrl = 'https://api.asmr-200.com/api/search'
  }
  encode(s) {
    if (!s) return ''
    let e = s.replace(/\$/g, '%24').replace(/:/g, '%3A').replace(/\//g, '%2F').replace(/ /g, '%20')
    return encodeURIComponent(e)
  }
  build(s, o = {}) {
    const e = this.encode(s)
    const params = new URLSearchParams({
      order: o.order || 'create_date',
      sort: o.sort || 'desc',
      page: o.page || 1,
      pageSize: o.pageSize || 100
    })
    return { raw: s, encoded: e, full: this.baseUrl + '/' + e + '?' + params.toString() }
  }
  async copyToClipboard(url) {
    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
  }
}
export default new UrlConstructor()
