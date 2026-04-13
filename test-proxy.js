const hostname = "proxy.anikuro.ru";
function matchHostname(hostname, pattern) {
  const host = hostname.toLowerCase();
  const candidate = pattern.toLowerCase();
  if (candidate === "*") return true;
  if (candidate.startsWith("*.")) {
    const base = candidate.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === candidate;
}
const allowedStr = "*.febbox.com,febbox.com,*.shegu.net,*.febbox.org,*.stream.febbox.com,*.pobreflix.com,pobreflix.com,*.tmdb.org,api.themoviedb.org,image.tmdb.org,sub.wyzie.ru,api.theintrodb.org,*.vidlink.pro,vidlink.pro,*.vodvidl.site,*.b-cdn.net,videostr.net,oneproxy.1x2.space,*.1x2.space,*.anikuro.ru,proxy.anikuro.ru,*.megaup.cc,megaup.cc,*.megaup.nl,megaup.nl,*.megaup.live,megaup.live,*.app28base.site,app28base.site,*.animekai.to,animekai.to";

const allowed = allowedStr.split(",").map(v => v.trim().toLowerCase()).filter(v => v.length > 0);
console.log("Allowed hosts:", allowed.filter(a => a.includes('anikuro')));
console.log("Matches proxy.anikuro.ru?", allowed.some(pattern => matchHostname("proxy.anikuro.ru", pattern)));
console.log("Matches *.anikuro.ru against proxy.anikuro.ru?", matchHostname("proxy.anikuro.ru", "*.anikuro.ru"));
