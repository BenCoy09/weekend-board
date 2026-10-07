# Weekend Board

**What do tokenized US stocks say while Wall Street is closed?**
I recorded the Binance Web3 RWA API from Thu Oct 1 to Tue Oct 6, 2026 and checked whether the weekend price pointed the right way.

Live page: https://bencoy09.github.io/weekend-board/  (also see `index.html`)

Built for the BNB Hack: Tokenized Stocks Edition.

## What I found

- **The weekend is a split market.** Sat 17:32 to Sun 19:46 UTC: 0 of 411 closed tokens changed price; 75 of the 77 live tokens did (46 bStock, 31 Ondo).
- **Two issuers, two prices.** 24 stocks were live on both Ondo and bStock. Median spread about 0.08%, max about 0.9% (SKHY). Ondo was higher in 21 of 24.
- **No on-chain vs reference gap.** `tokenPrice` behaves as `referencePrice x tokenToShareRatio`. Compared naively it shows fake ~900% gaps (NFLX, KLAC, PPLT); adjusted, `/rwa/price` shows exactly 0.000% premium on all 488 tokens in every priced snapshot.
- **Weekend price vs a later price (53 stocks).** Closer than Friday's price in 40 of 53; median miss 1.88% vs 2.52%. Direction right in 38 of 46 (83%), but "everything goes up" scored about 74%; after removing market drift it was about 69% (chance is about 50%). Correlation about 0.46.

## Limits (please read)

- One weekend, 53 stocks that move together, so not 53 independent tests.
- The "later" price is **Tue Oct 6 17:58 UTC**, about 28 hours after Monday's open (a power cut stopped Monday recording). It is not the opening print.
- The Friday baseline was taken 46 minutes after the close.
- ETHA jumped 204% (20.07 to 61.04) and is excluded as a probable data fault.
- Prices are the API's `referencePrice`. I could not confirm whether they are trades or oracle quotes.
- Research dataset, not trading advice.

## Run it

Needs Node.js 18+ and a Binance Web3 API key (https://web3.binance.com/en/dev-portal). No packages to install.

```
node probe.js        # first run asks for your key and secret, saves them to .env on your PC only
node recorder.js     # snapshots all 488 tokens (default every 5 min); Ctrl+C after the first line for one snapshot
node live.js         # which tokens have a live price right now
node pairs.js        # Ondo vs bStock spread for stocks live on both
node compare.js      # first vs last priced snapshot  (node compare.js last = last two)
node grade.js        # weekend price vs a later price; edit OPEN_UTC / FRI_*_UTC for another weekend
```

Set `INTERVAL_MIN=15` before `node recorder.js` to poll less often. Data is written to `data/snapshots.jsonl`.

Never commit `.env`. It is in `.gitignore`.

## API notes needed to run this

- Signed headers: `X-OC-APIKEY`, `X-OC-TIMESTAMP` (ISO 8601), `X-OC-SIGN` = Base64(HMAC-SHA256(timestamp + METHOD + signedPath)).
- The signed path starts with `/build` and includes the query string.
- `/rwa/price` rejected the documented 100 addresses per call with HTTP 414; `recorder.js` shrinks the batch automatically.

## How it was made

I ran all data collection and analysis myself on my own machine. The scripts and this page were written with AI assistance (Claude); the findings come from the recorded data, and the Developer Experience Report is separate and written by me.
