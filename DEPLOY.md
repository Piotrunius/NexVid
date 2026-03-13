## NexVid — Build i Deploy (skrót)

Poniżej znajdziesz kroki potrzebne do zbudowania aplikacji lokalnie, uruchomienia jej oraz wdrożenia na Cloudflare (Worker oraz Pages). Instrukcje są w formie komend do uruchomienia w terminalu. Zakładam, że pracujesz z repo w katalogu projektu.

---

## Wymagania wstępne

- Node.js (zalecane >=18)
- Git
- Konto Cloudflare z uprawnieniami do Pages / Workers
- Wrangler (możesz użyć lokalnej wersji z devDependencies przez `npm run ...` albo globalnej instalacji)

Jeśli chcesz zainstalować `wrangler` globalnie:

```
npm install -g wrangler@4
```

Lub używaj lokalnej wersji z `node_modules` (polecane w tym repo): uruchamiaj przez `npm run <script>` lub `npx wrangler ...`.

---

## 1) Install dependencies

Użyj `npm` lub `pnpm` zgodnie z preferencjami. Repo zawiera skrypty npm; niektóre narzędzia (np. `@cloudflare/next-on-pages`) działają najlepiej z `pnpm` — jeśli wolisz `pnpm`, użyj go.

```
npm install
# lub jeśli używasz pnpm
pnpm install
```

---

## 2) Lokalny development

- Uruchom frontend (Next.js, port domyślny 3000):

```
npm run dev
```

- Uruchom Worker proxy lokalnie (używa pliku `worker/wrangler.toml`):

```
npm run worker:dev
```

Teraz frontend może komunikować się z lokalnym workerem (jeśli konfigurujesz `APP_BASE_URL` lub originy, sprawdź `worker/wrangler.toml`).

---

## 3) Build produkcyjny (Next -> Pages output)

Ten projekt korzysta z `@cloudflare/next-on-pages` aby przygotować output dla Cloudflare Pages.

Opcja szybka (skrypty z `package.json`):

```
npm run build
# wygeneruje .vercel/output/static poprzez skrypty pages:build-output i pages:prepare
npm run pages:deploy
```

`pages:deploy` w `package.json` robi 3 kroki:
1. przygotowuje build dla Pages (`@cloudflare/next-on-pages`)
2. uruchamia `scripts/prepare-pages-output.mjs` (aliasy/porządkowanie)
3. wysyła output do Cloudflare Pages przez `wrangler pages deploy .vercel/output/static --project-name nexvid`

Uwaga: podczas deployu Cloudflare Pages może ostrzegać, że masz niezatwierdzone zmiany. Możesz wymusić deploy mimo to:

```
npx wrangler pages deploy .vercel/output/static --project-name nexvid --commit-dirty=true
```

---

## 4) Deploy Worker (tylko Worker)

Worker proxy znajduje się w katalogu `worker/` i posiada swój `wrangler.toml`.

Skrypt (używa lokalnej wersji wrangler z devDependencies):

```
npm run worker:deploy
```

To wykona `wrangler deploy --config worker/wrangler.toml` i opublikuje worker → adres typu `https://<name>.<your>.workers.dev`.

Możesz też użyć `npx wrangler deploy --config worker/wrangler.toml` bez instalacji globalnej.

---

## 5) Deploy Cloudflare Pages (tylko Pages)

Jeśli chcesz tylko deployować statyczny output (Pages), po wygenerowaniu `.vercel/output/static` uruchom:

```
npx wrangler pages deploy .vercel/output/static --project-name nexvid --branch main
```

To utworzy alias `main.nexvid.pages.dev` (lub odpowiedni url zależny od konfiguracji projektu Pages w panelu Cloudflare).

- Aby dodać drugi alias/branch (np. `nexvid`):

```
npx wrangler pages deploy .vercel/output/static --project-name nexvid --branch nexvid
```

---

## 6) Deploy Worker + Pages razem

Przykładowy flow, który wykona worker deploy i Pages deploy:

```
npm run worker:deploy
npm run pages:deploy
```

Lub użyj `npx` bezpośrednio:

```
npx wrangler deploy --config worker/wrangler.toml
npx wrangler pages deploy .vercel/output/static --project-name nexvid --branch main
```

---

## 7) Zarządzanie sekretami i zmiennymi środowiskowymi

- Secrets dla Pages (np. API keys używane w build/runtime):

```
npx wrangler pages secret put SECRET_NAME
```

- Secrets / env vars dla Workers:

```
npx wrangler secret put SECRET_NAME --binding NAME
```

Sprawdź `wrangler.toml` w katalogu `worker/` i w repo root (jeśli istnieje) aby zobaczyć jakie `vars` i `d1_databases` są skonfigurowane.

---

## 8) Debugowanie i logs

- Oglądanie logów worker'a (tail):

```
npm run tail
# lub
npx wrangler tail --config worker/wrangler.toml
```

- Sprawdzanie statusu deploymentu Pages oraz adresów w panelu Cloudflare Pages.

---

## 9) Przydatne wskazówki

- Jeśli `wrangler` ostrzega o wersji — dobrze jest zaktualizować lokalne devDependency:

```
npm install --save-dev wrangler@4
```

- Jeśli używasz różnych menedżerów pakietów, trzymaj się jednego (npm vs pnpm). `@cloudflare/next-on-pages` wykrywa używany manager i może preferować `pnpm`.
- Jeśli chcesz, aby deploy Pages był zawsze od tzw. "czystego" commita, przed deployem commituj zmiany lub użyj `--commit-dirty=true` (opcja ustawia deploy mimo niezatwierdzonych zmian).
- Zanim udostępnisz klucze/sekrety, przechowuj je jako secrets (Dashboard lub `wrangler pages secret put`), NIE wrzucaj do repo.

---

## 10) Szybkie komendy referencyjne

```
# instalacja
npm install

# dev
npm run dev
npm run worker:dev

# build
npm run build

# worker deploy
npm run worker:deploy

# pages deploy (skrypt z package.json)
npm run pages:deploy

# ręczne pages deploy (branch alias)
npx wrangler pages deploy .vercel/output/static --project-name nexvid --branch main
npx wrangler pages deploy .vercel/output/static --project-name nexvid --branch nexvid

# secret (pages)
npx wrangler pages secret put SECRET_NAME

# secret (worker)
npx wrangler secret put SECRET_NAME --binding NAME

# tail logs
npx wrangler tail --config worker/wrangler.toml

# Automated deploy (git commit, worker + pages together)
npm run ship
```

---
