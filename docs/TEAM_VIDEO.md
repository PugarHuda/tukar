# Team presentation video

The SCF Open Track asks for "a well-put together video presentation showcasing the team". This is
it, 1 minute 50 seconds, served at https://tukar-six.vercel.app/team.mp4 and embedded on slide 18
of the deck.

Every picture in it is a Playwright recording of a real public page, taken on 2026-09-21: the live
Tukar app, the GitHub profile and repositories, and the live sites of the prior projects. The boxes
are drawn where the capture measured the element being talked about, so a box can only land on
something that was really on the page. The captions light each word as it is spoken, using the
voice's own word timings.

## How it is built

| Stage | Command, from `video/` | What it does |
|---|---|---|
| Narration | `npm run team:vo` | Speaks each line with edge-tts into `public/team/vo/<id>.mp3` and keeps every word's start and end |
| Capture | `npm run team:capture` | Films each page at 1600x900, measures every box, writes `public/team/cap.mp4` and `public/team/marks.json` |
| Render | `npm run team:render` | Remotion composition `TukarTeam`, 1920x1080 |
| Ship | `npm run team:ship` | Compresses it into `webapp/public/team.mp4` |

`npm run team` runs all four. The script is `video/team/script.json`. A box whose element is not
found is logged and left out; the 2026-09-21 run found all twelve.

To record it in your own voice, read the lines below over the silent render, or replace the files in
`public/team/vo/` with your own recordings of the same lines and re-run `team:render`. The word
highlighting would then need new timings, so the simplest path is to keep the generated voice.

## The script

Each line is what the narration says, then what it means in Indonesian, then what the box points at.

**t01 · the live app.** "Hi, I'm Pugar Huda Mantoro, and I am the whole team behind Tukar, a private
remittance corridor on Stellar. This is who is building it, and why the build can be trusted."
Saya Pugar Huda Mantoro, seluruh tim di balik Tukar. Video ini soal siapa yang membangunnya dan
kenapa hasilnya bisa dipercaya. Box: the headline of the live app, "Live on Stellar testnet".

**t02 · GitHub profile.** "I build in public. Over a hundred repositories and thousands of
contributions in the past year, and most of them are products you can open, not experiments."
Saya membangun secara terbuka, lebih dari seratus repo dan ribuan kontribusi setahun terakhir.
Boxes: the repository counter, then the contributions heading.

**t03 · pinned work.** "Several were judged well. Diam took first at the iExec Vibe Coding
Challenge, the Portaldot developer kit took first, Brownie to Ape took second, and KasPay was a
community choice at Kaspathon." Beberapa di antaranya menang. Box: the pinned repositories.

**t04 · Segel.** "The closest prior work is Segel, a sealed-bid OTC desk on Stellar. Same chain and
same proof stack as Tukar: Circom and Groth16 on BN254, verified on-chain by Soroban." Karya paling
dekat, chain dan stack proof yang sama dengan Tukar. Box: Segel's headline.

**t05 · Bisik.** "Private settlement is the thread through most of my work: Bisik on Canton, Senyap
on Midnight, Diam on iExec, and Sealed Pair on Sui." Settlement yang privat adalah benang merah
karya saya. Box: Bisik's headline.

**t06 · Amanah.** "Compliance is the other half. Amanah pairs zero-knowledge KYC with proof of
reserves, across ten contracts on Casper testnet." Separuh lainnya kepatuhan. Box: Amanah's headline.

**t07 · Utuh.** "Utuh is a completeness layer: it bonds that nothing was left out of an attestation.
That is the same question Tukar's audit requests work on." Utuh menjamin tidak ada yang tertinggal,
pertanyaan yang sama dengan audit request di Tukar. Box: Utuh's headline.

**t08 · Tukar's README.** "Tukar itself placed fifth in Stellar Hacks: Real-World ZK, and was a
Grand Finalist at Stellar APAC, in payments and consumer applications." Juara 5 dan Grand Finalist.
Boxes: "placed 5th", then "Grand Finalist", on the README itself.

**t09 · open source.** "All of it is open source: fifteen Soroban contracts, eight circuits, and
three hundred thirty-three passing contract tests." Semuanya open source. Box: the repository's file
list.

**t10 · close.** "What I have not done yet is scale a product to real users. That is the honest gap,
and the plan buys in the operational specialists for it. Private in the middle, accountable at the
edges." Yang belum pernah saya lakukan adalah membawa produk ke pengguna nyata dalam skala, dan itu
dikatakan terus terang. Box: the live app's headline.

## What it deliberately does not claim

No users, no volume, no revenue and no partners are claimed. The hackathon results are presented as
recognition, not traction. The DoraHacks results page could not be filmed because it sits behind a
human-verification wall, so the placements are shown where the project states them, in its own
README, and the narration names the event rather than implying an SDF endorsement.
