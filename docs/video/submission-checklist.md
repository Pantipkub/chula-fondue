# Submission checklist — video + proposal

## Video package

- [x] Thai narration script prepared with target runtime about 4:40 — [script](script-th.md)
- [x] Storyboard and evidence-backed demo cues prepared — [storyboard](storyboard.md), [demo cues](demo-cues.md)
- [ ] Record and edit the actual clip; target duration is under 5:00
- [ ] Review playback, audio, readable terminal text, title/outro and total duration
- [ ] Confirm no secrets, personal data or misleading PASS claims appear in the recording
- [ ] Keep `output/video/` empty until a real playable recording is created; do not use a placeholder file as a video

## Proposal package

- [x] `docs/proposal.md` exists (v1.0, 27 October 2026)
- [x] `docs/proposal.pdf` exists
- [x] ADR register and three rendered diagrams exist (`docs/adr/`, `docs/diagrams/`)
- [x] Proposal reports actual NFR results and open Ticket stopped 504-vs-503 finding
- [ ] Before final submission, open the current PDF and confirm page rendering/readability on the delivery device

## Claims to preserve

- Performance: both endpoint p95/error criteria passed for this local test profile only
- Overall verification suite: **FAIL**, one Ticket stopped status classification (504 observed; 503 expected)
- Compose DNS and persistence: verified on one local host; does not demonstrate IP change, HA, cloud or multi-host discovery
- `NOT_RUN`: 1,000-user capacity, 99.5% uptime observation, security assessment, backup/restore and production deployment

## Current delivery status

**Ready to record; not ready to submit as a completed video.** There is no actual clip in `output/video/` yet. Proposal source/PDF and diagrams are present; recheck PDF readability and version consistency immediately before submission.
