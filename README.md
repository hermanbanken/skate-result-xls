# Skate Results
Parse and display (ice) skating results and laptimes.

This project began as an effort to parse XLSX files published on inschrijven.schaatsen.nl, extracting ice skating result times and intermediate laptimes automatically. Then it became more, the goal became to create a platform containing all (ice) skate times from multiple sources with quick retrieval, easy comparison and insight into progress.

# Features

- [x] Webserver shows:
  - [x] Recent competitions
  - [x] Rankings for a selected competition
  - [x] Laptimes for a selected competition
  - [ ] Older competitions from [OSTA](http://osta.nl) and [SpeedSkatingResults.com](http://SpeedSkatingResults.com)
- [x] Library does:
  - [x] Parsing of XLSX result files from [inschrijven.schaatsen.nl](http://inschrijven.schaatsen.nl)

# Structure
The package consists of a library function and a standalone function. When included as an NPM package it gives you functions that take some XLSX data source and output race times. When ran as a server it provides an web interface to browse competitions and results and next to inschrijven.schaatsen.nl as a source it also uses OSTA and SpeedSkatingResults.com for displaying race times on a per person basis.

# Future goals

- [ ] Mobile app that shows skate results, and caches them for quick retrieval on spot (ice rink with little mobile internet).
- [ ] Personal page of results, records and progress
- [ ] Comparing skaters on several statistics
- [ ] More permanent storage of results instead of lazy/caching approach used now
