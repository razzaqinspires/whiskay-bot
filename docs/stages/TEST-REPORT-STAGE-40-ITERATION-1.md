# Stage 40 Iteration 1 — Test Report

Automated tests in `test/stage40-downloader-parity.test.js` cover platform URL host allowlists for 11 supported URL examples, endpoint de-duplication and rejection of invalid endpoint forms, URL scheme/credential rejection, and existence of all five new adapter plugins.

The tests do not contact external providers or WhatsApp. The shared provider must be configured by the operator and return supported JSON fields. YouTube search/play, GitHub clone ZIP handling, and live provider compatibility remain unverified/deferred.
