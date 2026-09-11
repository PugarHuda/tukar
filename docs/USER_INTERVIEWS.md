# User interview kit

An instrument for collecting evidence, not a record of evidence. Nothing in this file is a
finding. Every example below is labelled as a format example and is invented purely to show
the shape of an entry. When real interviews have been run, their findings go in the tally in
section 10 and the write-up in section 13, and they must be traceable to a dated note.

Status on the day this was written: **zero interviews have been run. Tukar has no users, no
volume, and no validated need.** The proposal currently supports its problem statement with
World Bank aggregate figures, which describe the size of a market and not a need that any
identified person has voiced. Aggregate statistics cannot be the evidence for product-market
fit, and a reviewer who reads them as such is being asked to take a leap the document has not
earned.

Status on 2026-09-12: **still zero interviews.** What changed on that date is that the kit stopped
being a script and became something one person with no budget can start on tomorrow morning.
Section 12 lists recruiting channels that were checked by fetching them, and says which ones could
not be checked. Section 16 has the messages to send. Section 17 covers the part between a yes and a
transcript. Section 18 fixes the disconfirming thresholds and their consequences while the number of
interviews is still zero. Section 19 is the results file, and it is empty. None of that is evidence.
Evidence starts when the first row of section 19.1 is filled in.

---

## 1. What this document is for

SCF #46 Build requires product-market fit shown either through significant user traction, or
through a clearly validated need identified by a team or individual with relevant experience
in the Stellar ecosystem, and the evidence must be verifiable in-submission. Tukar has neither
today. There is no path to traction before the 2026-11-08 deadline, so the only honest route
is the second one: go and find out whether the need is real, write down what people actually
said, and put a sample a reviewer can weigh into the submission.

The bar this kit aims at is modest and reachable: a small number of interviews, honestly
described, with verbatim quotes, a stated sample size, a stated recruiting channel, and a
stated selection bias. A reviewer trusts five interviews described that way far more than a
claim of extensive user research with nothing behind it.

The kit is sized for one person in Yogyakarta with a full-time job and the seven weeks left before the deadline.

---

## 2. The three claims on trial

The proposal makes three claims that interviews can test. Write them down first, because an
interview that is not trying to settle a specific claim produces pleasant conversation and no
evidence.

**Claim 1, the cost and friction claim.** Sending money home is expensive and slow enough that
senders have already changed something about how they do it.

- Confirmed by: a sender who switched providers, splits transfers to dodge a fee band, waits
  for a rate, uses an informal carrier, or has lost money and can say how much.
- Disconfirmed by: senders who use one app, pay whatever it costs, cannot recall the fee, and
  have never looked for an alternative. If the cost does not register, the cost is not a wedge.

**Claim 2, the privacy claim.** Amounts and counterparties being visible causes a real problem
for senders or receivers.

- Confirmed by: a concrete past incident. Someone found out an amount and something followed:
  a request for a loan, a family argument, a neighbour's comment, a change in what the receiver
  was asked for, a decision to send through a different person to keep it quiet.
- Disconfirmed by: senders who announce the amount in a family WhatsApp group, receivers who
  collect cash at a counter in front of neighbours and think nothing of it, and nobody able to
  name an occasion when visibility hurt. **This is the most likely disconfirmation in the whole
  kit, and it must be reported if it happens.** See section 3.7.

**Claim 3, the compliance buyer claim.** A licensed operator has a current, costly problem that
a privacy-with-provable-compliance rail addresses, and the person interviewed has or can name
the authority to buy.

- Confirmed by: a named recurring cost, a named piece of work someone does by hand every month,
  a deal or a corridor that stalled on this, a Travel Rule counterparty exchange that failed, or
  a customer who complained about on-chain visibility.
- Disconfirmed by: nobody has ever raised on-chain visibility with them, their pain is somewhere
  else entirely (sanctions screening false positives, licensing, liquidity, correspondent
  banking), and privacy ranks nowhere in the top five. **The entire B2B2C thesis rests on this
  group and it is the group the proposal has the least evidence about.**

Each claim gets its own row in the tally in section 10, and each ends up as one honest sentence
in section 13, whichever way it goes.

---

## 3. Rules for asking

These are the rules that decide whether the answers are worth anything. Rob Fitzpatrick's The
Mom Test is the well-known version of most of them. They are not style preferences.

**3.1 Ask about the past, never about the future.** People are reliable historians and unreliable
prophets. "Walk me through the last time you sent money home" produces facts. "Would you use an
app that hides the amount?" produces a polite yes from someone being kind to a stranger, and a
polite yes is worth nothing to a reviewer and worse than nothing to the founder, because it feels
like progress.

Every question in the scripts below is anchored to something that already happened: the last
time, the worst time, the first time, what they used before.

**3.2 Do not name the product, blockchain, Stellar, privacy, zero-knowledge, or crypto until the
marked wall.** Each script has a line reading `=== SOLUTION WALL ===`. Above it, the interviewer
is a person learning how money gets home. Below it, the interviewer has a thing to show. Once the
solution is named, every answer after it is contaminated by politeness and by the desire to be
helpful, which is why the wall sits at the end and why nothing above it can be re-asked below it.

If the respondent asks early what this is for, answer briefly and vaguely and steer back: "I am
looking at how people send money home, I will show you what I am building at the end if you want."

**3.3 Ask for numbers they can actually recall, and record how they recalled them.** Fee, rate,
minutes or days, times per month, amount. Then mark each number as R (recalled from memory), C
(checked on their phone during the call), or E (estimated when pushed). A recalled fee is evidence
the fee registers. An estimated one is evidence it does not, which is itself a finding about
Claim 1.

**3.4 Hunt for what they have already done about it.** This is the strongest available signal that
a problem is real, and it is stronger than anything they say about how they feel. Look for money
already spent, a workaround already built, a service already abandoned, a person already paid, a
rule they follow ("I always send on Sunday because"). Ask "what did you do about it" after every
problem they mention, and then ask it again about the answer.

**3.5 Never let them rate a problem in isolation, make them rank it.** "Is sending money home
annoying?" gets a yes from everyone. "Of the things about working abroad that cost you money or
time, where does sending money home sit?" gets a position, and a problem that comes fourth is a
problem nobody will switch providers for.

**3.6 Keep the question pairs symmetric.** Both answers must be equally easy and equally socially
acceptable to give. Not "did it bother you that people could see the amount?" but "who knew how
much you sent, and did that matter either way?" A question that signals the answer you want will
get it.

**3.7 Write the disconfirming questions in, and report what they find.** Each script contains
questions marked **[DISCONFIRM]** whose purpose is to give the thesis a fair chance to fail. If
senders turn out not to care who sees the amount, this kit must surface it and the submission
must say so. A disconfirming result is a useful result. It is cheaper to learn in September that
the privacy wedge belongs to the compliance buyer and not to the sender than to learn it after a
mainnet launch, and a submission that reports a mixed result reads as a team that ran real
research. A submission reporting three for three confirmations from fifteen interviews reads as a
team that led the witness.

Burying a disconfirming answer is the one thing in this process that would be fraud rather than
error.

**3.8 Shut up.** After a question, wait. The most useful sentence in most interviews is the second
one, which arrives after a silence the interviewer did not fill. When they stop, use "what happened
next?", "and then what did you do?", or just repeat their last three words back as a question.
Never offer a candidate answer, and never finish their sentence with the answer you were hoping for.

**3.9 Do not accept compliments, ideas, or promises as data.** "That sounds great", "you should add
X", and "I would definitely use that" are all noise. The only currency that counts after the wall is
a commitment they actually pay for: time booked in a diary, an introduction to a named person made
in front of you, a document they agree to send, or an agreement to test on testnet with a real
transaction. Write down the commitment, not the enthusiasm.

**3.10 Record verbatim, in their words.** Write down what they said, in the language they said it,
not the summary of what it meant. "Kadang saya kirim dua kali biar biayanya lebih murah" is evidence.
"Sender optimises for fees" is your interpretation of evidence and cannot be quoted.

---

## 4. Consent and privacy preamble

Read aloud, before any question, in the language the interview will run in. These conversations
touch someone's money and often their immigration situation, and some respondents will be in a
precarious position. Do not improvise this part.

> Thank you for your time. Before we start I want to be clear about three things.
>
> First, I am not selling anything, I am not a bank or an agent, and I am not connected to any
> government office. I am building something and I am trying to learn how money actually gets home
> before I build any more of it.
>
> Second, what happens to this conversation. I would like to take written notes. [If recording: I
> would also like to record the audio so I do not misquote you. I can turn it off at any time, and
> I will delete the audio once my notes are written.] Some of what you say may be quoted in a public
> funding application to a foundation. If I quote you, I will quote the words and nothing that
> identifies you: no name, no employer, no city, no agency, no phone number, no account number.
> You will appear as something like "Sender 3, Indonesian, works in Taiwan, sends monthly".
>
> Third, you are in charge. You can skip any question without giving a reason, you can ask me to
> stop taking notes, you can tell me after the call to delete anything, and you can end this at any
> point. There is no wrong answer here and nothing you say will make me think less of your choices.
> I am not going to ask about your visa or your documents, and please do not tell me about them.
>
> Is that all right? Can I take notes?

Rules that go with the preamble and are not optional.

- **Never ask about immigration or documentation status.** It has no bearing on any claim in section
  2, and it puts the respondent at risk for the founder's benefit. If they volunteer it, do not write
  it down, and say that you are not writing it down.
- **Never ask for an account number, a transaction reference, a screenshot with a name in it, or the
  receiver's contact details.** If a screenshot is offered, read the number off it and hand it back or
  ask them not to send it.
- **No recording without a spoken yes on the recording.** Start the recorder, then ask the consent
  question again so the yes is captured, then continue.
- **Consent is revocable after the fact.** Send a short message a day later with the anonymised label
  you assigned and the one or two quotes you plan to use, and ask if they are happy with them. A quote
  confirmed after the fact is safer for them and stronger in the submission.
- **No payment for interviews**, and say so at the start. Paying for answers changes the answers and
  it changes who volunteers. A thank-you afterwards, sent without having been promised, is fine.
- **Receivers are often introduced by a sender.** They must get the preamble independently and out of
  earshot of the sender, because a receiver will not describe what actually happens to the money with
  the sender listening.

---

## 5. Anonymisation, and where the notes live

**Label convention.** Assign a label at the moment of the interview and use it everywhere afterwards.

    <Group><n>, <nationality>, <where they work or live>, <frequency or role>

Format examples, invented to show the shape and not describing any real person:

- `Sender 3, Indonesian, works in Taiwan, sends monthly`
- `Receiver 2, Indonesian, Central Java, receives from a sibling`
- `Compliance 1, compliance officer at a licensed MTO, Southeast Asia corridor`

Rules for the label. Nationality and broad region only, never a city for receivers and never an
employer name for anyone in group C. If a corridor is so small that the role plus the country
identifies the person, widen it to the region and say in the write-up that you widened it. If a
compliance respondent asks to be described more vaguely than the convention, use their wording.

**The key file.** One file maps labels to real people. It never enters the repository, it is not
in any cloud folder shared with anyone, and it is the only place a name appears. Everything else,
including your own notes, uses the label from the first line onwards.

**Where files go.**

| File | Location | In git? |
|---|---|---|
| Label to person key | Local disk only, outside the repo directory | Never |
| Audio recordings | Local disk only, deleted once notes are written | Never |
| Raw per-interview notes | Local disk only, outside the repo directory | Never |
| Anonymised summaries and the tally | This repository, when written up | Yes |

The repository is public. Before the first interview, confirm that the notes directory is outside
the repository tree entirely. Do not rely on `.gitignore` for this, because a path inside the tree
is one `git add -f` or one stray tool away from being published permanently.

---

## 6. Script A, senders

Target respondent: an Indonesian or Filipino worker abroad who sends money home. The primary user
in [`PRODUCT.md`](../PRODUCT.md). Budget 30 to 40 minutes and expect to get through most of it.

Opening, after the preamble: "I am not going to ask you anything technical. I just want to hear how
it actually goes."

### A1. Establishing the routine (5 min)

1. How long have you been working in [country]?
2. Who do you send money to at home?
3. When did you last send money home?
4. Before that one, when was the time before?

The gap between questions 3 and 4 is the real frequency. Do not ask "how often do you send" first,
because the answer is a rounded habit and not a fact.

### A2. The last transfer, start to finish (12 min, the core of the interview)

5. Take me through that last one from the beginning. Where were you, what time was it, what did you
   open first?
6. How much did you send? [If they hesitate: a rough figure is fine, or skip it.]
7. What did it cost you? Was there a fee on top, or was it inside the rate?
8. Do you remember that number, or would you have to check? [Mark R, C or E per rule 3.3.]
9. What exchange rate did you get? How did you know what it was?
10. Did you compare it against anything before you sent?
11. How long was it from you pressing send to them having the money in their hands?
12. How did you find out it had arrived?
13. Did you have to go anywhere physically, or leave work, or queue?
14. How many times in a month do you do this whole thing?

### A3. History and switching (6 min)

15. What did you use before this one?
16. Why did you stop using it? What happened?
17. Who told you about the one you use now?
18. Have you ever used more than one at the same time? What decides which?
19. Has anyone in your family or your circle told you that you are doing it the expensive way?

Question 16 is the most valuable question in section A3. A switch is a past action with a cost, and
the story behind it is where the real pain is.

### A4. What went wrong, and what it cost (8 min)

20. Tell me about a time it went wrong.
21. What did you do when that happened? Who did you call?
22. How long did it take to sort out?
23. Did it cost you anything in the end? How much?
24. Has money ever arrived late when it was needed for something specific? What was the thing?
25. Have you ever sent a different way than usual because of something like that? What way?
26. Have you ever sent cash with a friend flying home, or used someone unofficial? How did that go?
27. Is there anything you do every time now because of something that went wrong once?

Question 27 is the workaround question. A rule someone follows every month is a scar, and scars are
the cheapest evidence of a real problem.

### A5. Visibility and who knows (6 min, contains the disconfirmers)

Ask these flatly, with no loading in either direction.

28. When you send, who at home knows the exact amount?
29. How do they find out, do you tell them or do they see it?
30. **[DISCONFIRM]** Does it matter to you either way whether they know the exact figure? Some people
    say it is fine and some say it is not, both are normal.
31. Has anyone outside your family ever known what you send? How did that happen?
32. **[DISCONFIRM]** Has knowing the amount ever caused a problem, for you or for them? Tell me about
    that time.
33. Have you ever asked someone at home not to mention that money came?
34. Has anyone ever asked you for a loan or for help right after a transfer landed?
35. Do you send the same amount every time, or does it change? Does anyone comment when it changes?
36. Is there anyone you would rather did not know how much you earn or send? [If yes, leave it there,
    do not press for who.]

If questions 30 to 34 come back consistently as "it does not matter, everyone knows, it is normal",
that is Claim 2 disconfirmed on the sender side, and section 13 must say so.

### A6. Ranking and closing the unaided part (4 min)

37. Think about the things that cost you money or time while working here: housing, the agency,
    phone and internet, going home, sending money. Put sending money in that list. Where does it sit?
38. If sending money home got easier tomorrow, what would actually change for you?
39. Who else do you know who sends money home that I should talk to?
40. Is there anything I should have asked you and did not?

    === SOLUTION WALL. Nothing above this line may mention the product, a wallet, crypto, blockchain,
    Stellar, privacy, or zero-knowledge proofs. Everything below is a different activity and its
    answers are weaker evidence. Do not go below the wall if you are short of time, the section above
    is worth more. ===

### A7. After the wall (5 min, optional)

Only now describe what you are building, in one or two sentences, with no jargon. Then:

41. Reacting to it honestly, what is wrong with that for someone like you?
42. What would stop you trying it?
43. Would you be willing to try sending a test transfer on a test network with me for fifteen minutes
    on a call, no real money involved?

Record only the answer to 43, and only as a yes with a date in a diary or a no. Enthusiasm about the
idea is not recorded as a finding, per rule 3.9.

---

## 7. Script B, receivers

Target respondent: the family member at home who collects the money and turns it into local currency.
Their constraints are usually invisible to the sender, which is the reason this is a separate script
and not three extra questions at the end of script A.

Interview them alone. See section 4. Budget 20 to 30 minutes, because the routine is shorter and the
questions are more concrete.

### B1. The routine (4 min)

1. Who sends you money, and how long has that been going on?
2. When did the last one arrive?
3. Did you know it was coming, or did it just arrive?
4. Who in the house handles it when it comes?

### B2. Collecting it, start to finish (10 min, the core)

5. Walk me through the last one. How did you first know the money was there?
6. What did you have to do to get it into your hands?
7. Where did you go? How far is that from the house, and how did you get there?
8. How long did the whole trip take, door to door?
9. Did you have to queue? How long?
10. Did you have to take time off work or take someone with you?
11. What did you have to show them? Did that ever cause a problem?
12. How much did you receive in rupiah or pesos in the end?
13. Was that the amount you expected? Who told you what to expect?
14. Was anything taken off at your end, a fee or a charge at the counter?
15. What did you do with the money that same day?

Questions 12 and 13 together test whether the receiver ever discovers a gap between what was sent
and what arrived, and who absorbs the surprise. That gap is the off-ramp problem the product claims
to solve with an FX gate, and it is worth more here than anywhere else in the kit.

### B3. What went wrong (6 min)

16. Tell me about a time the money did not arrive when it should have.
17. What did you do? Who did you contact, you or the sender?
18. Did you have to borrow in the meantime? From whom?
19. Has a collection ever been refused or delayed at the counter? What was the reason given?
20. Is there anything you do differently now because of something that happened before?

### B4. Visibility at the receiving end (5 min, contains the disconfirmers)

21. **[DISCONFIRM]** Who else knows when money arrives for you? How do they know?
22. Does the person at the counter know you, or your family?
23. Has anyone ever asked you about it, at the counter or in the neighbourhood?
24. **[DISCONFIRM]** Does it matter to you whether people know? Some people say it is fine and some
    say it is not.
25. Has anyone asked you for money soon after a transfer arrived? What happened?
26. Do you ever ask the sender to send a different way, or to a different person?

### B5. Ranking and closing (4 min)

27. Of the things that make a month hard, where does collecting this money sit?
28. If this got easier, what would change for you?
29. Is there anything I should have asked and did not?

    === SOLUTION WALL ===

### B6. After the wall (3 min, optional)

30. [Describe it in one sentence.] What would stop you using something like that?
31. Do you have a smartphone you use for money, and what do you already use on it?

Question 31 lives below the wall deliberately. Asked earlier it steers the whole conversation towards
apps, and the question this script exists to answer is what the trip to the counter actually costs.

---

## 8. Script C, the compliance side

Target respondent: someone who works in remittance compliance now. A compliance or AML officer at a
money transfer operator, a bank's financial crime team, a Stellar anchor's operations or compliance
lead, or a consultant who files for several of them. The whole privacy-with-compliance thesis rests
on this group, and the proposal has the least evidence about it, so treat these as the highest value
interviews even though they are the hardest to get.

Recruiting overlaps with [`docs/ANCHOR_OUTREACH.md`](ANCHOR_OUTREACH.md), which is a separate
document covering how to approach anchors. Use that for the approach message and this file for what
to ask once someone says yes.

### C0. Extra ground rules for this group

- Say at the start: "I am not asking for anything about your customers, your filings, or anything
  confidential. If a question goes somewhere you cannot go, just say so and I will move on."
- Expect a third of them to need employer permission. Offer to talk with no recording and no
  attribution at all, and offer to send the questions in advance, which costs nothing and raises the
  yes rate.
- Never ask for a document. If they offer one, ask whether it is public.
- Budget 30 minutes, and they will hold you to it. If you only get one section, make it C2.

### C1. Their actual job (5 min)

1. What is your role, and what does a normal week look like?
2. How big is the compliance function, how many people?
3. What corridors do you cover?
4. What tooling do you have for screening, monitoring, and reporting?

### C2. The last painful thing (12 min, the core)

5. What was the last compliance problem that ate a whole day?
6. Take me through it. Who was involved, how did it start, how did it end?
7. How often does something like that happen?
8. What is the thing your team still does by hand every month that you wish it did not?
9. How many people-hours a month does that take?
10. What did your team last buy or build to make one of these problems smaller? What did it cost?
11. Was there a corridor or a partner you walked away from because the compliance side did not work?
    What was the blocker?

Questions 10 and 11 are the equivalents of rule 3.4 for this group. Budget already spent and a deal
already refused are far stronger evidence than any opinion about privacy.

### C3. Public ledgers and counterparty data (8 min, contains the disconfirmers)

12. Do you settle anything over a public blockchain today, or has that come up?
13. **[DISCONFIRM]** Has anyone, a customer, a partner, your own commercial team, or your board, ever
    raised the fact that transaction amounts and counterparties are visible on a public chain? What
    exactly did they say?
14. If that has never come up, is that because it does not matter, or because it is not on the radar
    yet?
15. How do Travel Rule exchanges work for you today? What breaks?
16. When a counterparty asks you for originator or beneficiary information, what happens, concretely?
17. When a regulator or an auditor asks you to evidence something about a specific transaction, what
    do you have to produce, and how long does it take?
18. Has an auditor ever asked for something you could not produce? What happened next?
19. **[DISCONFIRM]** If a settlement rail hid amounts and counterparties from the public ledger but
    could prove specific facts to you and to your regulator on demand, what would your first objection
    be? [Ask for the objection, not the reaction. The objection is information and the reaction is
    politeness.]
20. Who would have to sign off on a rail like that, and who would say no first?

Question 13 is the single most important question in this kit. If the answer across every compliance
interview is that nobody has ever raised on-chain visibility, Claim 3 is in serious trouble and
section 13 must say so in plain words.

### C4. Ranking and buying (5 min)

21. Rank these by how much they cost you today: sanctions screening false positives, Travel Rule
    exchanges, audit and evidence production, licensing and reporting, liquidity and settlement
    timing, on-chain transparency. [Read the list, let them reorder it, write the order down.]
22. What did your team actually pay for last year in this area?
23. If a rail like the one I described existed and worked, who would you have to convince, and what
    would they ask for before a pilot?

    === SOLUTION WALL. In practice the wall sits earlier in this script, because question 19 has to
    describe the shape of the thing to get a usable objection. Keep the description to one sentence,
    keep it vendor-neutral, and never name Tukar, Stellar, or zero-knowledge above this line. ===

### C5. After the wall (5 min)

24. [Now name it and show it, 90 seconds.] What is wrong with this?
25. What would a pilot have to look like before your firm would touch it?
26. Who else should I be talking to, inside or outside your firm?

The only commitments worth recording here: an introduction made in front of you, a follow-up call in
a diary, or a named condition for a pilot. Everything else is politeness.

---

## 9. Note template

One page per interview, filled in during the call and finished within an hour of it, while the
wording is still recoverable. Copy this block per interview into the local notes file.

```
LABEL:            (e.g. Sender 3, Indonesian, works in Taiwan, sends monthly)
GROUP:            Sender / Receiver / Compliance
DATE:             YYYY-MM-DD          DURATION:        minutes
LANGUAGE:         ID / EN / mixed     MODE:            call / video / in person / voice notes
RECRUITED VIA:    (exact channel, and who introduced them)
CONSENT:          preamble read Y/N   notes Y/N   recording Y/N   quotes confirmed after Y/N
REACHED WALL:     Y/N                 (did the unaided part complete before the product was named)

NUMBERS (mark each R = recalled, C = checked on phone, E = estimated when pushed)
  amount sent / received:            [   ]  R C E
  fee paid:                          [   ]  R C E
  exchange rate:                     [   ]  R C E
  time from send to in hand:         [   ]  R C E
  transfers per month:               [   ]  R C E
  door to door collection time:      [   ]  R C E   (receivers)
  hours per month on manual work:    [   ]  R C E   (compliance)

ALREADY DONE ABOUT IT (rule 3.4, the strongest signal there is)
  switched provider:        Y/N   from ___ to ___   because ___
  money already spent:      Y/N   how much ___      on what ___
  workaround or standing rule:     ___
  service abandoned:               ___
  deal or corridor refused:        ___              (compliance)

WHAT WENT WRONG LAST TIME
  what happened:                   ___
  what they did about it:          ___
  what it cost them:               ___

RANKING (rule 3.5): where the problem sat in their own list, and what beat it
  position: __ of __     things ranked above it: ___

CLAIM EVIDENCE
  Claim 1 (cost and friction):   supports / contradicts / neutral   note: ___
  Claim 2 (privacy):             supports / contradicts / neutral   note: ___
  Claim 3 (compliance buyer):    supports / contradicts / neutral   note: ___

VERBATIM QUOTES (their words, their language, no cleanup, mark the ones they confirmed)
  1. "                                                              "
  2. "                                                              "
  3. "                                                              "

COMMITMENT MADE (only real ones: an intro made, a date in a diary, a document sent, a test agreed)
  ___

SURPRISE (the thing you did not expect, written before you rationalise it away)
  ___

INTERVIEWER ERRORS (leading questions asked, product named early, silences filled)
  ___
```

The last two fields matter more than they look. The surprise field is where new failure modes get
caught, and the errors field is the only mechanism that improves the interviewing across the seven weeks.

---

## 10. Tally across interviews

One row per interview, appended as they happen. This is the table that becomes the evidence summary,
so it must be maintained during the seven weeks and not reconstructed at the end.

| Label | Date | Group | Recruited via | C1 | C2 | C3 | Switched | Already spent | Ranked position | Reached wall |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

C1, C2 and C3 take `+` (supports), `-` (contradicts), or `o` (neutral or not covered).

Alongside it, keep a running counts block:

```
Senders      n = __    C1: +__ -__ o__    C2: +__ -__ o__
Receivers    n = __    C1: +__ -__ o__    C2: +__ -__ o__
Compliance   n = __    C3: +__ -__ o__
Switched providers at least once: __ of __ senders
Named a past incident where visibility caused a problem: __ of __ senders, __ of __ receivers
Compliance respondents who have ever heard on-chain visibility raised: __ of __
```

Two discipline rules for the tally.

- **Fill in the minus signs.** A tally with no minus signs anywhere is evidence that the questions
  were leading, not evidence that the thesis is right. If after ten interviews nothing contradicts
  anything, reread section 3 and assume the problem is the interviewer.
- **A new failure mode is worth more than a repeat confirmation.** Track distinct failure modes in a
  separate list. When three consecutive interviews in a group add no new one, that group is saturated
  and further interviews in it are not the best use of the remaining weeks.

---

## 11. How many interviews, and the weeks that are left

Today is 2026-09-12 and the deadline is 2026-11-08, which is seven weeks and four days. The founder
is one person with a full-time job who also has to finish the rest of the submission. Anything that
assumes full-time research is a plan that will not be executed, and a plan that is not executed
produces the same evidence as no plan.

**What one interview actually costs.** Not forty minutes. Counted end to end on the channels in
section 12: finding and chasing the introduction, 60 minutes. Agreeing a slot and surviving one
reschedule, 20 minutes. The call itself, 40 minutes. The write-up inside the hour, 45 minutes. The
quote confirmation the next day, 15 minutes. That is three hours per completed interview, and it
does not count the approaches that never answer at all.

**Target: 12 completed interviews, as 6 senders, 4 receivers, 2 compliance.**

**Credible floor: 8, as 4 senders, 3 receivers, 1 compliance.**

**Ceiling: 16.** Past that, the marginal interview in a saturated group costs time the rest of the
application needs.

**Why 12 and not more.** Twelve interviews at three hours each is 36 hours across seven and a half
weeks, which is 4.8 hours a week: two weekday evenings and part of a Saturday. Twenty-two would be
66 hours, or 8.8 hours a week, on top of a full-time job and the rest of the application. An earlier
draft of this section proposed 22 with no arithmetic behind it. That number is withdrawn, because a
target that cannot be hit produces a shortfall to explain instead of evidence to show.

**Why 12 is still worth having.** Six senders is enough for a pattern to repeat or to visibly fail to
repeat, and small enough that every claim has to be written as a count ("4 of 6") rather than a
percentage, which is the correct way to report a sample this size anyway. The thresholds in section
18 were chosen to be reachable at six. Four receivers is enough to see whether the gap between what
was sent and what arrived is real, which is the one thing only a receiver can tell you. Two
compliance interviews do not validate Claim 3 and are not claimed to: two is what cold outreach to
that group honestly returns in seven weeks, and section 13 has to say in plain words that Claim 3
rests on two conversations.

**Why not fewer.** Below the floor of 8 no group has enough respondents to show anything repeating,
and the write-up becomes a list of anecdotes. Even so, 8 honestly described beats 0, and 0 is the
current position.

**What "defensible" means here.** Not statistically significant. Nothing at this size is, and any
document that implies otherwise is lying. Defensible means a reviewer can check it, which needs four
things, and the count is the least important of them:

1. the recruiting log in section 19.1 shows how many approaches produced how few interviews, so the
   denominator is visible and the difficulty is not hidden,
2. the quotes are verbatim, in the language spoken, and confirmed with the respondent afterwards,
3. the disconfirming thresholds in section 18 were fixed before any data existed, and this file's git
   history shows they were fixed before and not after,
4. the selection bias is stated by the founder before the reviewer finds it.

Twelve interviews with those four properties are worth more to a reviewer than fifty without them.
That is the whole argument for the number, and it is the argument to make in the submission.

**The schedule, with real dates.**

| Week | Dates | Work |
|---|---|---|
| 1 | Sat 12 Sep to Sun 20 Sep | The six decisions in section 15 written down, and the thresholds in section 18 accepted or amended. Notes directory created outside the repository tree. Every compliance approach sent, all of them, in one sitting, because that group has the longest lead time. Every organisational email in section 12 sent in the same sitting. Two receiver interviews from within one introduction of the founder, treated as pilots for the script. |
| 2 | Mon 21 Sep to Sun 27 Sep | Scripts revised from what the pilots exposed. 2 receivers. First and only chase of every organisation that has not replied. Ask each receiver, at the end, for their sender. |
| 3 | Mon 28 Sep to Sun 4 Oct | 2 senders, reached through the receivers interviewed in weeks 1 and 2. |
| 4 | Mon 5 Oct to Sun 11 Oct | 2 senders. Mid-point review on Sunday 11 October against rule K10 in section 18, and against the tally: are there any minus signs yet, and is the wall holding. |
| 5 | Mon 12 Oct to Sun 18 Oct | 1 sender, 1 compliance if one has landed. |
| 6 | Mon 19 Oct to Sun 25 Oct | 1 sender, 1 compliance. If three consecutive sender interviews added no new failure mode, senders are saturated: stop adding them and spend the slots on compliance, which will not saturate. |
| 7 | Mon 26 Oct to Sun 1 Nov | Interviewing stops on Sunday 1 November with no exceptions, including for the interview that finally said yes. Section 13 written from the tally, with the numbers as they actually are. |
| 8 | Mon 2 Nov to Sun 8 Nov | Quote confirmations sent and returned. Findings folded into the proposal and the submission. Buffer, because something above will have slipped. |

That is 4 receivers, 6 senders and 2 compliance, which is the target. Every slot that slips comes out
of the sender count first, because senders are the group that saturates earliest and the group the
proposal is least short of argument about.

Two notes on the shape. Compliance outreach goes out in week 1 and not week 4, because a compliance
officer replying in three weeks is normal and one replying in three days is not. And the mid-point
review exists because the most common failure of a solo interview programme is not too few
interviews, it is twelve interviews that all lead the witness the same way.

---

## 12. Recruiting, which is the bottleneck

Writing the script was the easy half. The reason this kit has produced no transcripts is that nobody
has been asked yet. This section lists places that were checked on 2026-09-12 by fetching them, what
a stranger can realistically do with each, and what each is honestly likely to return.

**How each entry was verified.** Every organisation below was fetched over HTTPS on 2026-09-12, and
the details quoted here (address, telephone, email, stated purpose) were read off the page that came
back. Where a site needed a real browser to pass a bot check, that is noted. Anything that could not
be fetched is in section 12.4 and is deliberately not recommended. Contact details on public pages
change: re-check before writing, and never write to an individual person's name found in a directory.

**Corridor priority against reachable population.** The stated corridor priority is United States to
Philippines first and Saudi Arabia to Indonesia second. The founder's reachable population is the
other way round: he lives in Yogyakarta, speaks Bahasa Indonesia, is within one or two introductions
of families who receive money from the Gulf, and is within none of a Filipino worker in California.
The honest resolution is to run the Indonesia corridor as the evidence base, run the United States to
Philippines corridor as a gatekeeper experiment with a low expected yield, and state in the write-up
which corridor the evidence actually came from. Presenting Indonesian evidence as evidence about the
United States to Philippines corridor would be the same error as presenting World Bank aggregates as
a validated need, committed one level further down.

### 12.1 Saudi Arabia to Indonesia, verified channels

**BP3MI D.I. Yogyakarta**, the regional office of the Indonesian migrant worker ministry.

- *Verified:* listed in the official office directory at `https://aim.bp2mi.go.id/profil/bp3mi`,
  fetched 2026-09-12, HTTP 200. The directory gives the address as Jalan Candi Sambisari No. 311A,
  Purwomartani, Kalasan, Sleman, Yogyakarta, telephone 085161337403, open Monday to Friday 08.00 to
  16.00 WIB.
- *Access path:* telephone first, then walk in, and ask for whoever handles pemberdayaan or community
  outreach. Ask for permission to talk to returning workers and their families. Never ask for a list
  of names, and expect to be refused if you do.
- *Their own rules:* this is a public office, not a forum, so there is nothing to post. A public
  office may decline without giving a reason and is under no obligation to help a private founder.
- *Honest yield:* 0 to 3 introductions, most likely 1, and a first visit may produce only a second
  appointment. Worth doing anyway because it is the only channel on this page in the founder's own
  city.

**KP2MI**, the national ministry (Kementerian Pelindungan Pekerja Migran Indonesia / BP2MI).

- *Verified:* `https://kp2mi.go.id` fetched 2026-09-12, HTTP 200, page title "KP2MI | KEMENTERIAN
  PELINDUNGAN PEKERJA MIGRAN INDONESIA/BADAN PELINDUNGAN PEKERJA MIGRAN INDONESIA", TLS certificate
  subject "KEMENTERIAN PELINDUNGAN PEKERJA MIGRAN INDONESIA / BP2MI". Published on the page: call
  centre 08001000 from inside Indonesia and +6221-29244800 from abroad, complaints WhatsApp
  0811-8080-141, the BP3MI office directory, and a "G to G Saudi Arabia" placement programme section,
  which is the corridor in question.
- *Practical note:* the certificate chain it serves is incomplete, so some clients refuse the site. A
  browser opens it.
- *Access path:* the call centre and the complaints WhatsApp exist for migrant workers in trouble.
  Do not use them for research. The usable path here is the BP3MI office above.
- *Honest yield:* 0 as a recruiting channel. Listed because the office directory and the corridor
  programme are context the interviewer needs before asking anyone anything.

**KJRI Jeddah**, the Indonesian Consulate General in Jeddah.

- *Verified:* `https://kemlu.go.id/id/jeddah` fetched 2026-09-12 in a browser, because the site
  renders client side and a plain fetch returns an empty shell. The page identifies itself as
  KONSULAT JENDERAL REPUBLIK INDONESIA DI JEDDAH, KERAJAAN ARAB SAUDI, gives the address as 4653
  Al-Muallifin Street, Al Rehab District/5, PO Box 10 Jeddah 23344, telephone +966 50 360 9667 and
  +966 12 671 1271, email jeddah.kjri@kemlu.go.id, and carries a Pelindungan WNI section. Its news
  feed shows recurring mobile service days and public awareness sessions for Indonesian citizens in
  Saudi cities.
- *Access path:* one email to the published address, addressed to the Pelindungan WNI function,
  asking whether they would forward a request to community groups they already work with. It must say
  explicitly that no personal data is being asked for.
- *Their own rules:* there is no public posting mechanism and no published rule permitting or
  forbidding research requests. It is a request a mission is entirely free to ignore.
- *Honest yield:* 0 to 1, most likely 0. A diplomatic mission has no reason to connect an
  unaffiliated founder to citizens in a precarious position. Send once, do not chase.

**KBRI Riyadh**, the Indonesian Embassy in Riyadh.

- *Verified:* `https://kemlu.go.id/id/riyadh` fetched 2026-09-12 in a browser. Identifies itself as
  KEDUTAAN BESAR REPUBLIK INDONESIA DI RIYADH, KERAJAAN ARAB SAUDI. Address: Diplomatic Quarter,
  P.O. Box 94343, Riyadh 11693. Telephone (+966) 11 4882800 and +966 569173990. Email
  riyadh.kbri@kemlu.go.id.
- *Access path, rules and yield:* identical to Jeddah, and the same expectation of silence.

**SBMI, Serikat Buruh Migran Indonesia**, the migrant workers union.

- *Verified:* `https://sbmi.or.id` fetched 2026-09-12 in a browser (client-side rendering; a plain
  fetch returns an empty document). The site describes an organisation of Indonesian migrant workers
  and their families working through advocacy, critical education and organising, founded in 2003 and
  present in 15 provinces. Published contact: sekretariat@sbmi.or.id, +62 811-8626-776, Jl. Komp.
  Garuda No.20, RT.13/RW.4, Kalibata, Kec. Pancoran, Jakarta Selatan.
- *Access path:* one email or WhatsApp to the secretariat in Bahasa Indonesia, using message 1 in
  section 16, offering the question list up front so it can be judged before anyone is introduced.
- *Their own rules:* no public forum and no published policy on outside research. Treat the absence of
  a rule as a no until a person says yes, and never post into their channels uninvited.
- *Honest yield:* 0 to 4, most likely 1 to 2 if anyone replies. This is the strongest organisational
  channel in this section, because a union's members are exactly the population and a union has a
  reason to care what is done with what they say. Expect to be questioned about that, and answer
  properly: a union that does not ask is the one to worry about.

**Migrant CARE.**

- *Verified:* `https://migrantcare.net` fetched 2026-09-12, HTTP 200. Describes itself as a civil
  society organisation established in 2004 advocating for Indonesian migrant workers and their
  families, running the DESBUMI village programme since 2013, with a reference to a Middle East
  emergency post. Published contact: +62 21-27808211, Jl. Karang Pola V No.1, RT.4/RW.3, Jati Padang,
  Ps. Minggu, Jakarta Selatan 12540.
- *Access path:* as SBMI. The specific thing to ask about is DESBUMI, because a DESBUMI village is a
  place where receiving families are concentrated and already organised, which is the population in
  script B.
- *Their own rules:* no public forum, no published policy. Same treatment as SBMI.
- *Honest yield:* 0 to 3, most likely 1.

### 12.2 United States to Philippines, verified channels

Every entry here is a gatekeeper, not a gathering place. None can be posted in by a stranger, all can
be written to, and all are free to ignore an unaffiliated founder on the other side of the world.
Read the yields before spending a week of the seven on this corridor.

**NaFFAA, the National Federation of Filipino American Associations.**

- *Verified:* `https://naffaa.org` fetched 2026-09-12. Describes itself as the largest national
  affiliation of Filipino American institutions, umbrella organisations and individuals, founded 1997,
  organised into fifteen member regions covering the continental United States, Alaska, Hawaii and the
  Pacific. Published contact: 1025 Connecticut Avenue NW, Washington DC 20036, +1 301 337 7352,
  info@naffaa.org.
- *Access path:* one English email to the published address, message 3 in section 16, asking the
  national office to point at one region rather than writing to fifteen regions at once.
- *Their own rules:* no open posting mechanism and no published rule about research requests.
- *Honest yield:* 0 to 1. A national umbrella body gets a lot of mail from people who want something.

**Migrante USA.**

- *Verified:* `https://www.migrante-usa.org` fetched 2026-09-12. Describes itself as an alliance of
  Filipino migrant workers in the United States and lists regional chapters for Washington, Oregon,
  Northern California, Southern California, the Midwest, the Northeast, and DC, Maryland and Virginia.
  Published contact: migranteusa@pm.me.
- **Check the spelling before writing to anyone.** The similar domain migranteusa.org, without the
  hyphen, was also fetched on 2026-09-12 and does not belong to the organisation: it currently serves
  an online gambling site. Use the hyphenated migrante-usa.org and nothing else, and do not trust a
  contact address found on the other one.
- *Access path:* one English email to the published address, naming the region you are asking about.
- *Their own rules:* no open posting mechanism, no published rule.
- *Honest yield:* 0 to 2, most likely 0 to 1. Better than NaFFAA in principle, because the membership
  is workers rather than institutions. Worse in practice, because a single volunteer inbox may not be
  read at all.

**Migrante International.**

- *Verified:* `https://migranteinternational.org/contact-us/` fetched 2026-09-12 in a real browser;
  the site sits behind a Cloudflare challenge and returns HTTP 403 to a plain fetch. Describes itself
  as a global alliance of grassroots migrants organisations of overseas Filipinos and their families
  in 24 countries, with chapter groupings for Asia and the Pacific, the Middle East, the USA, Canada
  and Europe. Published contact: Episcopal Mission Center compound, 275 E. Rodriguez Sr. Avenue, Brgy.
  Kalusugan, Quezon City, Metro Manila 1112, telephone +632 7092-4519,
  homeoffice@migranteinternational.org.
- *Access path:* the home office, asking to be pointed at one chapter. Its Middle East grouping is
  relevant to the second corridor as well, which is the one reason to prefer it over Migrante USA.
- *Their own rules:* no open posting mechanism, no published rule.
- *Honest yield:* 0 to 1.

**Philippine Consulate General, New York: the Fil-Am Community Directory.**

- *Verified:* `https://newyorkpcg.org/pcgny/culture-community/fil-am-community-directory/` fetched
  2026-09-12. It publishes a downloadable directory of Filipino community organisations ("Filipino
  Community Organization 2025") and a form through which organisations register themselves. The
  consulate's stated jurisdiction is Connecticut, Delaware, Maine, Massachusetts, New Hampshire, New
  Jersey, New York, Pennsylvania, Rhode Island and Vermont. Published telephone +1 212 764 1330.
- *Access path:* read the directory, pick three or four organisations whose stated purpose is
  community welfare rather than business or culture, and write to the organisation. Write to
  organisations, never to a person named in the directory.
- *Their own stated purpose, and the honest limit:* the directory exists so community groups and
  civic volunteers can find each other and so the consulate can reach them. Using it as a cold contact
  list for outside research is outside what it was published for. That does not make it forbidden, it
  makes it a request that has to be phrased as one, and it makes a low reply rate the expected and
  reasonable outcome rather than a surprise.
- *Honest yield:* 0 to 2 across the whole directory.

**Philippine Consulate General, Los Angeles.**

- *Verified:* `https://losangelespcg.org` fetched 2026-09-12; the older philippineconsulatela.org
  domain returns a 301 redirect to it. Stated jurisdiction: California, Hawaii and the western United
  States, with honorary consulates in Nevada and Arizona. The site publishes an outreach schedule of
  consular missions and offers registration and a list of Fil-Am organisations. Published contact:
  3435 Wilshire Blvd Ste 550, Los Angeles CA 90010, +1 (213) 639-0980, losangeles.pcg@dfa.gov.ph.
- *Access path:* as New York.
- *One honest observation:* the consular outreach missions are the only place on this entire page
  where senders on this corridor physically gather in numbers, and they are useless to a founder in
  Yogyakarta who cannot attend one. Listed so the option is visible if that ever changes.
- *Honest yield:* 0 to 2.

### 12.3 Routes that depend on no community at all

A solo founder with no network needs routes that need nobody's permission. These will produce most of
the twelve, and the first three are the plan.

**1. Receivers first, in the founder's own province.** The receiving end of the Saudi Arabia to
Indonesia corridor is in Java, and so is the founder. Start with people already within one
introduction: neighbours, family, colleagues, and the people they name. This needs no gatekeeper, no
email, and no reply from anyone. *Expected yield: 4 to 8 receivers over seven weeks*, which is more
than the plan needs, and it is why the schedule front-loads receivers instead of senders.

**2. Receiver to sender.** Every receiver has the sender's WhatsApp number and can pass on a request
in a way no stranger can. An introduction from the person who receives the money converts better than
any other approach available here. Ask at the end of the receiver interview, ask for one specific
person, and let the receiver send the first message. *Expected yield: 3 to 6 senders*, which is most
of the sender quota. *Bias:* these senders are on good enough terms with their receiver that the
receiver was willing to ask. Section 13 must state that.

**3. The referral chain, run as a rule and not as a hope.** Question A39 and question B29 exist for
this. The rule: ask every completed respondent for exactly one name, at the end, and ask for a name
rather than for "anyone who might be willing", because a request for one person gets one person and a
request for anyone gets nobody. *Expected yield:* this is the multiplier on routes 1 and 2 rather
than a channel of its own, and it is the difference between six interviews and twelve.

**4. Physical places in Yogyakarta and Central Java where receivers already are.** Bank and post
office counters, money changers and pawnshops, on the days transfers land. Ask the branch or the shop
for permission before approaching anyone. Never approach someone in the queue, never approach someone
who is holding cash, and wait until they are away from the counter: their safety matters more than
the interview, and a stranger asking a person carrying money about that money is exactly the thing
they should walk away from. *Expected yield: 0 to 4, unpredictable, and it costs a Saturday.* Use it
only if route 1 stalls.

**5. Compliance, which is a different activity entirely.** The approach message lives in
[`docs/ANCHOR_OUTREACH.md`](ANCHOR_OUTREACH.md) and the questions in section 8. The route is
approaches to named compliance and AML staff at licensed money transfer operators, remittance firms
and Stellar anchors, plus the Stellar ecosystem contacts the founder already has, including the SCF
referrer. Offer 30 minutes, no recording, no attribution, questions in advance. Send all of them in
week 1. *Expected yield: 1 to 3 completed calls from 15 to 25 approaches, most likely 2.*

**6. Deliberately not on this list: paid research panels.** Recruitment platforms will find screened
respondents on either corridor within days, and charge per completed interview plus an incentive paid
to the respondent. The constraint here is no budget, so they are out. They are named only so that
"nobody could be found" is never offered as the reason, when the accurate reason is that the fast
route costs money the founder does not have.

### 12.4 What could not be verified, and is therefore not listed

- **Reddit.** The obvious candidates are the subreddits for overseas Filipino workers, the
  Philippines, Indonesia, Saudi Arabia, and survey recruitment. None of them could be verified from
  this machine on 2026-09-12: reddit.com now requires a logged-in session for its JSON endpoints, the
  plain HTML is an empty application shell, a real headless browser was served a "Prove your humanity"
  challenge, and three public mirror instances returned 429 or 410. So neither their existence, nor
  their size, nor, more importantly, their own posted rules about surveys and research recruitment
  could be read. Those rules vary a great deal and several large communities ban this outright.
  Nothing about Reddit is recommended above and nothing should be assumed. The check takes two minutes
  in a logged-in browser: open the subreddit, read the sidebar rules, look for a rule about surveys,
  self-promotion or research, and message the moderators before posting. Do not post before reading.
- **Facebook and Telegram groups.** Diaspora and migrant worker groups on both platforms are the most
  obvious place these populations actually gather, and their membership rules and pinned rules are not
  visible without a logged-in account. None could be verified, so none are named. Same instruction as
  Reddit: the owner can read any specific group's rules in a minute while logged in, and a group that
  forbids outside requests forbids them for a reason that applies here too.
- **bp2mi.go.id, the old main domain.** It did not complete a TLS connection on 2026-09-12. Only the
  sub-applications aim.bp2mi.go.id and jdih.bp2mi.go.id responded. Use kp2mi.go.id.
- **A directory of Migrant Workers Offices in the United States.** dmw.gov.ph is live, but the
  expected directory path returned 404 on 2026-09-12, so no United States office is listed here.

### 12.5 The bias each channel creates

Every channel produces a skewed sample. That is unavoidable for one person in seven weeks and it is
not a problem, as long as the skew is stated in the write-up instead of hidden. Write the exact
channel per interview in the note template, not the category.

- **Receiver-first recruiting** selects for receivers in Java who are within two introductions of the
  founder. It under-represents receivers in NTT, NTB and Sulawesi, where the trip to a counter is
  longer and the collection problem is worse, which is exactly where the product's claim would be
  strongest. Say so.
- **Senders recruited through their own receiver** are selected for a relationship good enough that
  the receiver agreed to ask, and they will not speak freely about disagreements over money. Say so.
- **Organisational channels** (SBMI, Migrant CARE, the Fil-Am organisations) select for people already
  in contact with an advocacy body, which usually means they have had a problem. That skews towards
  the worst experiences. It is the opposite bias to the one above and it does not cancel it out. State
  both, and state which interviews came from which.
- **Compliance respondents** who accept a cold approach from a founder building a privacy product are
  predisposed to find privacy interesting. That is the worst possible bias for Claim 3, it must be
  stated, and it is the reason question C13 asks what has already happened rather than what they think.
- **The corridor itself.** Evidence from the Saudi Arabia to Indonesia corridor is evidence about that
  corridor. It is not evidence about the United States to Philippines corridor, and the write-up may
  not quietly generalise from one to the other.

---

## 13. Writing the findings into the submission

Write this section from the tally, not from memory, and write it after the interviews rather than
alongside them. The goal is a reviewer being able to check what was done.

**What the write-up must contain.**

1. **The number.** How many interviews, broken down by group, and how many were attempted or
   cancelled. Do not round up and do not count a message exchange as an interview.
2. **How people were found.** The actual channels, per section 12.
3. **The selection bias, stated by you before a reviewer finds it.** Naming your own sample's weakness
   is the cheapest credibility available in the entire application.
4. **Verbatim quotes**, in the original language with a translation, attributed to the anonymised
   label and nothing more.
5. **What contradicted the thesis**, given the same prominence as what supported it, with the count.
6. **What changed as a result.** A research finding that changed nothing in the product or the plan
   reads as decoration. If the interviews changed a corridor priority, a fee assumption, a screen, or
   which tranche does what, say which.
7. **What remains unevidenced.** If only two compliance interviews happened, the honest sentence is
   that Claim 3 rests on two conversations and is not yet validated.

**Where it goes.** The proposal's section 4a currently rests on the two World Bank figures, which stay
as market context and stop being offered as evidence of need. The interview findings go next to them,
and the Current Traction field in [`docs/SCF_SUBMISSION.md`](SCF_SUBMISSION.md) gains a short paragraph
with the count, the channel, the bias, and a pointer to the full write-up in the repository. The
existing honest statement that there are no users and no volume does not change, because interviews
are not traction and must never be presented as though they were.

**Format example of an honest paragraph.** The numbers, quotes and findings below are invented to show
the shape of the paragraph. They are not results, and this block must be deleted and replaced before
any of it is submitted anywhere.

> FORMAT EXAMPLE, NOT A FINDING. Between September and October 2026 the founder interviewed N
> Indonesian senders working in [countries], N receivers in [regions], and N compliance staff at
> licensed money transfer operators and anchors. Senders were recruited through diaspora community
> groups and by referral, which skews the sample towards workers who are comfortable online and
> under-represents those who still use cash agents. Receivers were introduced by the senders, so they
> are people on good terms with the person sending them money. N of N senders had switched providers
> at least once and could say why. On privacy the result was mixed: N of N senders described an
> occasion when someone knowing the amount caused a problem, while N said it did not matter to them at
> all, and one said [quote]. Compliance respondents ranked on-chain transparency [position] of six
> cost drivers. Full write-up, method, and anonymised notes: docs/USER_INTERVIEWS_FINDINGS.md.

**Things that must not appear in the write-up.** No invented quotes, no composite personas presented
as people, no percentages computed off a base of five, no "users tell us" without a count, no
"extensive research", and no finding that the tally does not support. Every claim in the write-up has
to be traceable to a dated note and a label.

---

## 14. Skrip Bahasa Indonesia

Mayoritas wawancara sender dan receiver bakal jalan pakai Bahasa Indonesia. Ini bukan terjemahan
harfiah dari skrip di atas, tapi versi yang enak diucapkan. Urutan dan nomor pertanyaannya sama, jadi
catatan dari dua versi tetap bisa dibandingin. Kalau lawan bicara lebih nyaman pakai bahasa daerah
atau campur-campur, ikutin saja, dan kutipannya dicatat persis seperti yang dia ucapkan.

### 14a. Pembukaan, izin, dan privasi (dibaca dulu sebelum nanya apa pun)

> Makasih ya sudah mau ngobrol. Sebelum mulai, saya mau jelasin tiga hal dulu.
>
> Pertama, saya bukan sales, bukan orang bank, bukan agen, dan bukan dari kantor pemerintah mana pun.
> Saya lagi bikin sesuatu, dan saya mau ngerti dulu gimana sih sebenarnya orang kirim uang ke rumah,
> sebelum saya lanjut bikin.
>
> Kedua, obrolan ini mau saya apain. Saya mau nyatat. [Kalau mau direkam: saya juga mau rekam
> suaranya biar saya nggak salah kutip. Kapan saja boleh minta saya matiin, dan rekamannya saya hapus
> begitu catatannya selesai.] Sebagian yang Mbak atau Mas omongin mungkin saya kutip di proposal
> pendanaan yang nanti bisa dibaca publik. Kalau saya kutip, yang saya tulis cuma kalimatnya, tanpa
> nama, tanpa nama tempat kerja, tanpa kota, tanpa nomor apa pun. Nanti nulisnya kira-kira begini:
> "Sender 3, orang Indonesia, kerja di Taiwan, kirim tiap bulan".
>
> Ketiga, ini semua terserah Mbak atau Mas. Boleh lewatin pertanyaan mana pun tanpa alasan, boleh
> minta saya berhenti nyatat, boleh besok bilang ke saya biar bagian tertentu dihapus, boleh berhenti
> kapan saja. Nggak ada jawaban yang salah di sini, dan apa pun yang diceritain nggak bikin saya
> mikir macam-macam soal pilihan Mbak atau Mas. Saya juga nggak bakal nanya soal visa atau dokumen,
> jadi tolong jangan diceritain juga.
>
> Gimana, boleh ya? Saya boleh mulai nyatat?

Catatan buat pewawancara: jangan pernah nanya status dokumen atau izin tinggal. Jangan minta nomor
rekening, nomor transaksi, atau screenshot yang ada namanya. Kalau ditawarin screenshot, cukup baca
angkanya, jangan disimpan. Penerima diwawancara terpisah, jangan barengan sama pengirimnya.

### 14b. Skrip A, pengirim

**A1. Rutinitasnya (5 menit)**

1. Sudah berapa lama kerja di [negara]?
2. Kirim uangnya buat siapa di rumah?
3. Terakhir kirim itu kapan?
4. Sebelum yang itu, kirimnya kapan?

**A2. Kiriman terakhir, dari awal sampai selesai (12 menit, ini intinya)**

5. Boleh cerita dari awal? Waktu itu lagi di mana, jam berapa, yang pertama dibuka apa?
6. Waktu itu kirim berapa? [Kalau ragu: kira-kira saja nggak apa-apa, atau dilewat juga boleh.]
7. Biayanya berapa? Kepotong di depan, atau ketahuannya dari kursnya?
8. Itu inget di luar kepala, atau harus ngecek dulu? [Tandai R, C, atau E.]
9. Waktu itu kursnya berapa? Taunya dari mana?
10. Sempat bandingin sama yang lain dulu nggak sebelum kirim?
11. Dari pencet kirim sampai uangnya ada di tangan mereka, berapa lama?
12. Taunya sudah sampai itu gimana?
13. Perlu ke mana-mana nggak, atau izin kerja, atau antre?
14. Sebulan biasanya berapa kali begini?

**A3. Riwayat dan pindah layanan (6 menit)**

15. Sebelum yang sekarang, dulu pakai apa?
16. Kenapa berhenti pakai yang dulu? Waktu itu ada kejadian apa?
17. Yang sekarang ini tau dari siapa?
18. Pernah pakai dua-duanya barengan? Yang nentuin pakai yang mana apa?
19. Pernah ada yang bilang, "kamu kirimnya kemahalan"? Siapa yang bilang?

**A4. Waktu ada masalah, dan ruginya berapa (8 menit)**

20. Pernah ada kejadian yang bikin repot soal kiriman? Ceritain dong.
21. Waktu itu Mbak atau Mas ngapain? Nelpon siapa?
22. Beresnya berapa lama?
23. Ujung-ujungnya ada uang yang hilang atau keluar lagi nggak? Berapa?
24. Pernah uangnya telat padahal di rumah lagi butuh buat sesuatu? Waktu itu buat apa?
25. Gara-gara itu, pernah ganti cara kirim nggak? Ganti ke apa?
26. Pernah nitip uang tunai ke teman yang pulang, atau lewat jalur nggak resmi? Gimana hasilnya?
27. Sekarang ada kebiasaan yang selalu dilakuin gara-gara kejadian yang dulu? Apa?

**A5. Siapa saja yang tau (6 menit, ini bagian yang justru harus bisa mematahkan asumsi saya)**

28. Kalau kirim, di rumah siapa saja yang tau persis nominalnya?
29. Taunya gimana, Mbak atau Mas yang bilang, atau mereka lihat sendiri?
30. **[DISCONFIRM]** Buat Mbak atau Mas sendiri, penting nggak sih mereka tau angka persisnya? Ada
    yang bilang biasa saja, ada yang bilang nggak enak, dua-duanya wajar kok.
31. Pernah ada orang di luar keluarga yang tau jumlah kirimannya? Kok bisa tau?
32. **[DISCONFIRM]** Gara-gara ada yang tau nominalnya, pernah jadi masalah nggak? Buat Mbak atau Mas
    sendiri, atau buat yang di rumah. Ceritain waktu itu gimana.
33. Pernah minta orang rumah biar jangan cerita-cerita kalau uangnya sudah masuk?
34. Pernah ada yang tiba-tiba pinjam uang atau minta bantuan pas habis kiriman masuk?
35. Nominalnya selalu sama, atau naik turun? Kalau turun ada yang nanya nggak?
36. Ada orang tertentu yang menurut Mbak atau Mas sebaiknya nggak usah tau penghasilan atau kiriman
    ini? [Kalau iya, cukup segitu, jangan dikejar siapa orangnya.]

**A6. Diurutin, lalu tutup bagian ini (4 menit)**

37. Coba pikirin hal-hal yang bikin keluar uang atau waktu selama kerja di sana: tempat tinggal, agen,
    pulsa dan internet, tiket pulang, kirim uang. Kalau diurutin, kirim uang ini nomor berapa?
38. Kalau besok kirim uang jadi jauh lebih gampang, yang berubah buat Mbak atau Mas apa?
39. Ada teman yang juga rutin kirim ke rumah yang kira-kira mau saya ajak ngobrol?
40. Ada yang harusnya saya tanyain tapi belum saya tanyain?

    === BATAS. Di atas garis ini jangan sekali-kali nyebut produk, dompet kripto, blockchain, Stellar,
    privasi, atau zero-knowledge. Di bawah garis ini nilainya sudah beda dan jawabannya lebih lemah.
    Kalau waktunya mepet, sudahi di sini saja, bagian atas jauh lebih berharga. ===

**A7. Sesudah batas (5 menit, opsional)**

41. [Jelasin satu dua kalimat, tanpa istilah teknis.] Jujur saja, menurut Mbak atau Mas apa yang
    kurang pas dari itu buat orang seperti Mbak atau Mas?
42. Apa yang bikin males nyoba?
43. Mau nggak nyobain kirim uang percobaan di jaringan tes, lima belas menit, bareng saya, tanpa uang
    beneran?

Yang dicatat cuma jawaban nomor 43, itu pun cuma "iya plus tanggalnya" atau "tidak". Pujian nggak
dicatat sebagai temuan.

### 14c. Skrip B, penerima

Diwawancara sendirian, tanpa si pengirim ikut nyimak. 20 sampai 30 menit.

**B1. Rutinitasnya (4 menit)**

1. Yang kirim uang ke Mbak atau Mas siapa, dan sudah jalan berapa lama?
2. Terakhir masuk kapan?
3. Sudah dikabarin dulu, atau tiba-tiba masuk?
4. Di rumah yang biasa ngurus ini siapa?

**B2. Ngambilnya gimana, dari awal (10 menit, ini intinya)**

5. Coba ceritain yang terakhir. Pertama kali taunya uang sudah masuk itu gimana?
6. Biar uangnya sampai ke tangan, harus ngapain saja?
7. Ngambilnya di mana? Dari rumah jauh nggak, perginya naik apa?
8. Sekali jalan itu total berapa lama, dari rumah sampai balik lagi?
9. Antre nggak? Berapa lama?
10. Sampai harus izin kerja, atau harus ditemenin orang?
11. Waktu ngambil, harus nunjukin apa? Pernah bermasalah nggak soal itu?
12. Akhirnya dapat rupiahnya berapa?
13. Segitu memang yang Mbak atau Mas kira? Yang ngasih tau harusnya berapa siapa?
14. Ada potongan lagi nggak pas ngambil di sana?
15. Uangnya hari itu juga langsung dipakai buat apa?

**B3. Kalau ada masalah (6 menit)**

16. Pernah uangnya nggak datang padahal harusnya sudah? Ceritain.
17. Waktu itu Mbak atau Mas ngapain? Yang ngurusin Mbak atau Mas sendiri, atau yang di luar negeri?
18. Sambil nunggu, sempat ngutang dulu nggak? Ke siapa?
19. Pernah ditolak atau ditunda pas mau ambil? Alasannya apa kata mereka?
20. Sekarang ada yang dilakuin beda gara-gara kejadian yang dulu?

**B4. Siapa saja yang tau di sini (5 menit)**

21. **[DISCONFIRM]** Selain keluarga serumah, siapa lagi yang tau kalau ada kiriman masuk? Taunya
    gimana?
22. Yang jaga loket kenal Mbak atau Mas, atau kenal keluarga?
23. Pernah ada yang nanya-nanya soal itu, entah di loket atau tetangga?
24. **[DISCONFIRM]** Buat Mbak atau Mas, orang tau atau nggak itu ngaruh? Ada yang bilang biasa saja,
    ada yang bilang risih.
25. Pernah ada yang minta uang nggak lama setelah kiriman masuk? Ceritanya gimana?
26. Pernah minta si pengirim ganti cara kirim, atau kirim lewat orang lain?

**B5. Diurutin, lalu tutup (4 menit)**

27. Dari hal-hal yang bikin sebulan itu repot, ngurus kiriman ini nomor berapa?
28. Kalau ini jadi gampang, yang berubah apa?
29. Ada yang harusnya saya tanyain tapi belum?

    === BATAS ===

**B6. Sesudah batas (3 menit, opsional)**

30. [Jelasin satu kalimat.] Apa yang bikin Mbak atau Mas nggak mau pakai yang seperti itu?
31. Punya HP yang dipakai buat urusan uang? Biasanya pakai aplikasi apa saja?

---

## 15. What the owner has to decide before interview 1

Six decisions. All of them are cheap now and expensive later, and none of them can be delegated.

1. **Recording, or notes only.** Recording gives accurate quotes and raises the chance a respondent
   declines or self-censors. Notes only is safer and loses exact wording. Pick one policy, apply it to
   everyone, and put it in the preamble. If recording: decide now where audio is stored and when it is
   deleted, and never put it in a shared cloud folder.
2. **How the founder is introduced.** Independent researcher, student, or founder building something.
   Founder is the honest one and the one that biases answers most, which is exactly why the solution
   wall exists. Whichever is chosen, it must be the same for everyone, because the introduction is part
   of the method and has to be described in the write-up.
3. **Whether anonymised findings and quotes will be published in the public repository.** This changes
   the consent wording. Right now the preamble promises quotes in a public funding application, and if
   a findings file is going into a public GitHub repository, the preamble has to say that too. Decide
   before the first interview, because retrofitting consent means going back to every respondent.
4. **Where the notes and the label key live on disk.** A path outside the repository tree, decided and
   created before the first interview. See section 5.
5. **Whether the Filipino sender group is in scope for this round.** Without a Tagalog-speaking
   introducer it will not happen properly in seven weeks. The honest options are to find one introducer
   in week 1, or to scope this round to Indonesian senders and say so in the write-up. Do not fill the
   quota with English-speaking Filipino respondents and present them as the primary user.
6. **What result would change the plan.** Write the answer down now, before any data arrives, so it
   cannot be rationalised afterwards. Specifically: if senders do not care who sees the amount, does
   Tukar reposition around the compliance buyer, keep the consumer framing, or change corridors?
   Deciding this in advance is the difference between research and a search for supporting quotes.
   This decision is now written out as ten numbered rules with explicit consequences in section 18.
   Item 6 is done when those thresholds have been read and either accepted or amended, in writing,
   before the first interview and not after it.

One more thing that is not a decision but a warning. Section 13's honesty requirements only work if
they are settled before the findings exist. It is much easier to commit to reporting a disconfirming
result today than it is to do it in week 7 with a deadline coming.

---

## 16. The outreach messages

The script is useless until somebody says yes, and most messages that ask for an interview fail in
the first two lines. These are written to be sent as they are. Change the names, change nothing else
without reading section 16.6 first.

**The rule these obey.** The Mom Test applies to the invitation as much as to the interview: ask
about their life, not about your idea. Nothing below mentions a product, a company, a wallet, crypto,
a blockchain, privacy, or Tukar. Nothing below promises money, because the founder has none to pay,
and a promise that cannot be kept poisons the sample and the relationship at the same time. Every
message offers an easy no, because a no now costs nothing and a reluctant yes costs a wasted evening
and produces polite answers that rule 3.9 says are worthless anyway.

### 16.1 Which language is the honest one

- **Saudi Arabia to Indonesia corridor: Bahasa Indonesia, informal.** This is the founder's own
  language and no translation is involved, which is the main reason this corridor is the realistic
  evidence base. Many workers on this corridor come from Java, Lombok and West Nusa Tenggara. If a
  respondent switches into Javanese or Sasak, follow them as far as you can, say plainly when you
  cannot, and record the quote in the language it was spoken in, per rule 3.10. Arabic is not needed
  at any point: the respondent is Indonesian, and the interview is about their life, not their
  employer's.
- **United States to Philippines corridor: English.** Most Filipinos working in the United States
  work in English daily, and an English message from a stranger is normal there in a way it is not in
  Java. This is the honest choice, not a shortcut.
- **The language this kit cannot honestly offer: Tagalog.** For a Filipino domestic or care worker who
  would rather speak Tagalog or Taglish, English is the second language and a stiff machine-translated
  Tagalog message from an unknown foreign number reads exactly like a scam, because that is what those
  messages usually are. Do not machine-translate these messages. If a respondent prefers Tagalog, the
  honest answer is that this round needs a Tagalog-speaking introducer to run that interview properly,
  which is decision 5 in section 15 and is still open.

### 16.2 Message 1, to an organisation, Bahasa Indonesia

For SBMI, Migrant CARE, and the BP3MI office. Send once, to the published address, in working hours
in their timezone.

> Selamat pagi. Perkenalkan, saya [nama], tinggal di Yogyakarta.
>
> Saya sedang mengumpulkan cerita tentang bagaimana keluarga di Indonesia menerima kiriman uang dari
> luar negeri: ngambilnya di mana, berapa lama, dan apa saja yang biasanya bikin repot. Ini riset
> kecil-kecilan yang saya kerjakan sendiri. Saya bukan sales, bukan orang bank atau agen, dan saya
> tidak mewakili perusahaan mana pun.
>
> Yang saya cari: orang yang bersedia cerita 20 sampai 30 menit lewat telepon atau WhatsApp, tentang
> pengalaman mereka sendiri. Tidak ada pertanyaan soal dokumen atau izin tinggal, tidak ada permintaan
> nomor rekening, dan tidak ada imbalan yang saya janjikan, karena saya memang tidak punya dana untuk
> itu. Saya lebih baik bilang begitu di awal.
>
> Kalau menurut [nama organisasi] ini kurang pas, tidak apa-apa sama sekali, dan saya tidak akan
> mengirim pesan lagi. Kalau mungkin pas, boleh saya kirim dulu daftar pertanyaannya supaya bisa
> dinilai sendiri?
>
> Terima kasih atas waktunya.

### 16.3 Message 2, to a person, through someone who knows them, Bahasa Indonesia

The highest converting message here, because the first line is the only thing that matters in it. Ask
the introducer to send their own message first, then send this.

> Halo Bu [nama], saya [nama], temannya [nama pengenal]. Kata beliau Ibu yang biasanya ngurus kiriman
> dari [negara] kalau uangnya sudah masuk.
>
> Saya lagi belajar soal gimana sebenarnya proses terima kiriman itu di lapangan, jadi saya ingin
> dengar ceritanya langsung: ngambilnya di mana, jauh nggak dari rumah, pernah ada masalah nggak.
>
> Sekitar 20 sampai 30 menit saja, lewat telepon, kapan pun Ibu longgar, termasuk malam atau akhir
> pekan. Saya nggak jualan apa-apa, nggak minta nomor rekening atau data apa pun, dan nggak bisa kasih
> imbalan, jadi kalau nggak berkenan sama sekali nggak masalah.
>
> Kalau berkenan, enaknya kapan?

For a sender abroad, introduced by their own receiver, change the second paragraph to: "Saya lagi
belajar soal gimana sebenarnya proses kirim uang ke rumah itu dari sisi yang di luar negeri: pakai
apa, biayanya gimana, pernah ada yang bikin kesal nggak."

### 16.4 Message 3, to a Filipino community organisation, English

> Dear [organisation],
>
> My name is [name] and I am based in Yogyakarta, Indonesia. I am doing a small piece of independent
> research on how families actually send and receive money across borders: which service people use,
> how long it takes, what goes wrong, and what it costs them in time as well as in fees.
>
> I am looking for people who send money home to the Philippines and would be willing to talk for
> about 30 minutes on a voice call about their own experience. I am not selling anything, I do not
> represent a bank or a remittance company, and I cannot offer payment, so I would rather say that at
> the start than imply otherwise. I do not ask about anyone's immigration status or documents, and I
> do not ask for account numbers.
>
> If this is not something your organisation would pass on, that is a fair answer and I will not write
> again. If it might be, I am happy to send the questions in advance so you can judge them first.
>
> Thank you for your time.

### 16.5 The follow-up, sent once and then never again

Seven days after the first message, three lines, and then the channel is closed regardless of the
answer. Chasing twice converts nobody and costs the founder's reputation with an organisation whose
help he may want later.

> Halo, cuma mengingatkan pesan saya minggu lalu soal riset kecil tentang kiriman uang. Kalau memang
> tidak bisa membantu, tidak masalah sama sekali dan tidak perlu dibalas. Terima kasih.

> Following up once on my message last week about a short piece of independent research on remittances.
> If it is not something you can help with, no reply is needed at all. Thank you for your time.

### 16.6 What must never be in any of these

Check each message against this list before sending it.

- No product name, no company name, no wallet, no crypto, no blockchain, no Stellar, no privacy, no
  zero-knowledge. The solution wall in section 3.2 starts at the invitation, not at the call.
- No payment, no voucher, no pulsa, no gift, no "small token of appreciation", no hint of one. A
  thank-you sent afterwards that was never promised is fine and is a different thing.
- No link, no attachment, no form, no app to install. A link in a first message from an unknown number
  is what a scam looks like, and the people being asked here are targeted by those constantly.
- No "quick", no "just five minutes", no "it will only take a moment" when it will take thirty.
- No request for a number, a document, a screenshot, or a contact, at any point in the invitation.
- No bulk send. One message, one recipient, written to that recipient, sent at a reasonable hour in
  their timezone. Twenty identical messages from one account on one evening is spam by any definition
  including the platform's.
- No second follow-up after 16.5.

---

## 17. From a yes to a transcript

Everything between an agreed slot and a usable set of notes. This is the part that a script does not
cover and that decides whether the interview is worth anything.

### 17.1 The first two minutes, when they think you might be a scam

They will be suspicious, and they are right to be. A stranger contacting someone about money is the
shape of nearly every fraud that targets migrant workers and their families. Do not sound offended,
do not sound hurt, and do not talk faster. Suspicion is a correct response to the available evidence,
and the job is to give them better evidence.

Four sentences, in this order, then stop and let them speak.

English:

> 1. "[Introducer] gave me your number, and said they would tell you I was going to call."
> 2. "I am not from a bank, not an agent, not from any government office, and I am not selling
>    anything."
> 3. "I am not going to ask you for an account number, a document, or a photo of anything. If anyone
>    ever asks you for those on a call like this, hang up on them."
> 4. "If this feels strange, hang up now and check with [introducer] first. I will not call again
>    unless you want me to."

Bahasa Indonesia:

> 1. "Nomor Bapak atau Ibu saya dapat dari [nama pengenal], katanya sudah dikabari kalau saya mau
>    telepon."
> 2. "Saya bukan orang bank, bukan agen, bukan dari kantor pemerintah, dan saya tidak jualan apa-apa."
> 3. "Saya tidak akan minta nomor rekening, nomor apa pun, atau foto dokumen. Kalau ada orang yang
>    minta itu lewat telepon, langsung ditutup saja."
> 4. "Kalau terasa aneh, ditutup dulu saja, tanya [nama pengenal] soal saya. Saya tidak akan telepon
>    lagi kalau tidak diminta."

Then offer them a way to check you, before they ask for one. Offering verification unprompted is the
single thing a fraudster will not do, and it is worth more than any reassurance:

> "Kalau mau, daftar pertanyaannya saya kirim dulu lewat WhatsApp, dibaca dulu, baru nanti kita
> ngobrol. Terserah Bapak atau Ibu."

Things that will make it worse: sending a link before the call, asking them to install anything,
opening with "I am building a startup", promising it will be quick when it will not, and any sentence
that sounds like it was read from a page even though this one was.

If they are still uneasy after two minutes, end it warmly and do not reschedule. A pressured
respondent gives polite answers, rule 3.9 says polite answers are worth nothing, and the recruiting
log in section 19.1 records a decline, which is real data about the channel.

### 17.2 Another timezone, a phone, a bad line

**The clocks, checked against the calendar for this round.**

- Saudi Arabia is UTC+3 and does not use daylight saving. Western Indonesia (WIB) is UTC+7. Saudi
  local time is Java time minus four hours. 21.00 in Yogyakarta is 17.00 in Jeddah or Riyadh, which is
  a realistic gap in a domestic worker's day, and Friday is the likeliest free day. Do not propose a
  slot that lands during a normal working afternoon there.
- The Philippines is UTC+8, one hour ahead of Java, with no daylight saving.
- The United States is the awkward one. Until 1 November 2026, US Pacific time is UTC-7 and US Eastern
  is UTC-4, so Java is 14 hours ahead of the Pacific and 11 hours ahead of the East. A Monday 09.00
  call in Yogyakarta is 19.00 on Sunday in California and 22.00 on Sunday in New York. Sunday evening
  their time against Monday morning yours is the only slot that suits a working respondent at both
  ends. On 1 November 2026 the United States puts its clocks back and those gaps become 15 and 12
  hours, which lands inside week 8, so re-check any slot agreed for that week.
- Always write the slot out in both local times with the day name, in the message, and invite them to
  correct it. Timezone errors do not cost a message, they cost the interview.
- Better still, ask for their window instead of offering yours. "Kapan biasanya longgar?" gets a real
  answer; a list of three slots gets whichever one is least inconvenient and then a no-show.

**The line will be bad. Plan for it rather than reacting to it.**

- Voice call, not video. Video costs them data, shows them their own face while they are trying to
  remember a fee, and shows you a room they may not want shown.
- Agree the drop protocol in one sentence before starting: if we get cut off I will call back twice,
  and if it still will not hold I will send the rest as voice notes, no problem either way.
- Ask in order of value, not in printed order. If the line is poor, open with A2 or B2, the last
  transfer start to finish, and treat A1 and B1 as optional warm-up you can lose. The core section has
  to survive the call.
- Read every number back to them out loud: "jadi tadi biayanya 40 ribu, betul?". A number misheard on
  a bad line becomes a wrong finding in a public document, and a wrong number is worse than a missing
  one.
- **Voice notes as a fallback mode.** A domestic worker with ten minutes between tasks can answer four
  questions as voice notes across a day, which is often the only mode that will ever work for that
  respondent. It loses the follow-up probe and rule 3.8's silence entirely, so it produces weaker
  evidence: mark `MODE: voice notes` in the note template, and do not record a number as recalled
  unless they say they knew it without checking.
- When a call drops and does not come back, send one message the same day saying the line was bad and
  asking when suits, then leave it alone. Do not ring back four times. Four missed calls from an
  unknown number is how a scam behaves.

### 17.3 Capturing what was said, not what you concluded

The failure this prevents: a notebook full of conclusions, from which no quote can be recovered and
which a reviewer cannot check. Conclusions are cheap and can be written later. Sentences can only be
captured while they are being said.

- **Write in two columns during the call.** Left column: the question number. Right column: the
  sentence, in their language, as spoken. Nothing else goes in the right column. No adjectives, no
  "seems frustrated", no "clearly a pain point". Those are readings, and readings change which
  question you ask next, which is how a leading interview happens.
- **Quotation marks mean exactly what was said.** If you are not sure of the wording, write it as a
  paraphrase with a leading tilde and no quotation marks. A quote mark you cannot defend has to be
  removed later, and a reviewer who catches one that was cleaned up will not trust anything else in
  the document.
- **Fill the number block during the call, with R, C or E marked at the moment.** Whether they knew a
  fee or guessed it cannot be reconstructed an hour later, and per rule 3.3 that mark is itself the
  finding.
- **Leave the claim fields empty during the call.** The CLAIM EVIDENCE lines in section 9 and the
  reading block in section 19.2 are filled in afterwards, deliberately, as a separate act.
- **Finish the template within the hour.** After a day the wording is gone and only the gist survives,
  and the gist is not quotable.
- **If recording, timestamp each quote as you write it**, so the audio can be checked once before it
  is deleted per section 4.

Live capture sheet, one per interview, on paper or in a plain text file:

```
  Q#   What they said, exactly, in the language they said it in
  ___  "                                                                            "
  ___  "                                                                            "
  ___  "                                                                            "
  ___  ~ not sure of the wording, paraphrase:
  ___  ~ not sure of the wording, paraphrase:

  Numbers as given, read back and confirmed:   R = recalled   C = checked   E = estimated
  ___  ______________________  [ R  C  E ]
  ___  ______________________  [ R  C  E ]
```

---

## 18. The decision rules, fixed before any data exists

Fixed on 2026-09-12, on which date the number of completed interviews is zero. That date is the whole
point. A threshold chosen after the answers are in is not a threshold, it is a rationalisation with a
number attached, and a reviewer can tell the difference by looking at when this section was written.

**How to read the table.** Each rule names the question that produces the evidence, what a
disconfirming answer sounds like, the count at which the rule fires, and what the owner does when it
fires. The last column is the one that matters. A disconfirming question with no stated consequence
is decoration, and the existing kit had ten of them with no consequences attached.

**Three standing rules over all ten.**

- A rule that does not fire because there were not enough interviews is reported as **not tested**,
  never as "not disconfirmed". Absence of evidence is not confirmation, and the write-up must use the
  words "not tested" so that a reviewer is not left to infer the difference.
- A threshold may not be moved after interview 1. If one is moved anyway, the change, its date and its
  reason go in the log at the end of this section and stay there, and the write-up says that a
  threshold was moved.
- If a rule fires, the finding is published, whatever it costs the application. That is section 3.7
  with a number attached to it.

| # | Claim | Questions | A disconfirming answer sounds like | Fires when | What the owner does, committed in advance |
|---|---|---|---|---|---|
| K1 | 2 | A30, A32 | "Everyone at home knows, it is normal, it has never caused any trouble" | 5 or more of 6 senders say it does not matter to them **and** not one can name a past incident | Sender-side privacy stops being the headline need. Section 4a of the proposal is rewritten to say the sender privacy premise was tested against six senders and not supported, and the consumer framing is replaced by the compliance framing in the submission. The claim changes, not the product, and not during this application. |
| K2 | 2 | B21, B24 | "The neighbours know, the counter staff know my family, it is fine" | 3 or more of 4 receivers say visibility is normal and none names an incident | The receiver-side privacy claim is deleted from the proposal rather than softened into something vaguer. |
| K3 | 1 | A7, A8, A10 | The fee is marked E, estimated when pushed, and was never compared against anything | 4 or more of 6 senders cannot recall the fee **and** have never compared providers | Cost stops being the wedge. The submission stops leading with cheaper and leads with whatever the interviews did surface instead (speed, reliability, the collection trip), or states plainly that no wedge was found. |
| K4 | 1 | A15, A16 | "I have always used this one, the agency set it up for me" | Fewer than 2 of 6 senders have ever switched provider | The assumption that senders will move to a new rail is flagged in the submission as unevidenced, and the acquisition plan in the proposal is rewritten around the operator rather than the sender. |
| K5 | 3 | C13 | "Nobody has ever raised that with us" | Every compliance respondent says it, with at least 2 interviewed | Claim 3 is reported as disconfirmed by the interviews that were run. The B2B2C thesis is presented as a hypothesis with a named next test, not as a validated need. |
| K6 | 3 | C21 | On-chain transparency placed fifth or sixth of the six cost drivers | Every compliance respondent ranks it fifth or sixth, with at least 2 interviewed | As K5, and the full ranking is printed in the write-up including the four things that beat it, by name. |
| K7 | 1 and 2 | A37 | Sending money ranked below housing, the agency, the phone, the ticket home | 5 or more of 6 senders place it fourth or lower | Every phrase implying urgency for the sender comes out of the submission, replaced by the sentence that the problem was ranked below three other costs by 5 of 6 respondents. |
| K8 | all three | A43 | "Maybe later", "send me a link", "I will think about it" | 0 of the senders who reached the wall agreed to a 15 minute testnet session with a date attached | Reported as zero commitments in the Current Traction field of the submission, in those words, with no substitute metric offered in its place. |
| K9 | 3 | C10, C11 | No budget ever spent on it, no corridor ever refused over it | No compliance respondent names either, with at least 2 interviewed | Claim 3's buyer is recorded as unproven: a problem was described but nobody has been found who pays to solve it. |
| K10 | the method itself | the recruiting log, 19.1 | Silence from gatekeepers, cancellations, nobody introduced | Fewer than 4 completed interviews by Sunday 11 October | The United States to Philippines corridor is dropped from this round that day, without renegotiation, and the remaining weeks run entirely on routes 1 to 3 in section 12.3. The submission then says the corridor was out of reach for this round, rather than implying it was covered. |

**The combination that is not a repositioning.** If K1, K3 and K7 all fire together, the finding is
that senders do not notice the cost, do not care who knows, and do not rank the problem highly. That
is the consumer thesis failing in three different ways at once, and it cannot be fixed by rewording.
The committed response is to say so in the submission in one plain sentence, and to put the remaining
effort either into Claim 3 alone or into not submitting this round. Writing that sentence down today
costs nothing at all. Writing it in week 7, with the deadline four days away, would be impossible,
which is exactly why it is written today.

**Threshold change log.** Empty, and never to be deleted from once something is written in it.

| Date | Rule | Old threshold | New threshold | Reason |
|---|---|---|---|---|
| | | | | |

Fixed by: ______________________   Date fixed: 2026-09-12   Read and accepted on: ______________

---

## 19. The results file, empty

This is where the evidence goes as it is collected. It is empty, and it will stay empty until real
interviews exist. It is ordered so that a reviewer meets the raw material before the conclusion,
because the conclusion is the part they cannot check.

Every filled row must correspond to a dated note in the local notes directory and a label from
section 5. Nothing here may be filled from memory, nothing may be filled in advance as a placeholder,
and nothing that is not an interview may be counted as one. If a separate findings file is created
later, it is a copy of this section, not a replacement for it.

### 19.1 The recruiting log, which is the denominator

One row per approach, not per interview. A reviewer learns more from forty approaches producing
twelve interviews than from the twelve on their own, and this is the only honest way to show how hard
it was. Log the approaches that were ignored, which will be most of them.

| Date sent | Channel, exactly | What was sent | Reply? | Outcome |
|---|---|---|---|---|
| | | | | |

```
Approaches sent:                     __
Replies of any kind:                 __
Agreed to talk:                      __
Completed interviews:                __
Cancelled, or agreed then vanished:  __
Declined, and gave a reason:         __
```

### 19.2 Per interview, the evidence before the reading

One block per completed interview, copied from the private note of section 9 with everything
identifying stripped out. The quotes come first on purpose.

```
LABEL:
GROUP:                          DATE:                 LANGUAGE:            MODE:
RECRUITED VIA:                                        REACHED WALL:  Y / N
CONSENT:   notes __    recording __    quotes confirmed on __

WHAT THEY SAID, VERBATIM (their language, no cleanup; translation underneath, marked as a translation)
  1. "                                                                              "
     [translation:                                                                  ]
  2. "                                                                              "
     [translation:                                                                  ]
  3. "                                                                              "
     [translation:                                                                  ]

NUMBERS AS GIVEN      (R = recalled, C = checked on their phone, E = estimated when pushed)
  amount sent or received:      ______  [ R  C  E ]
  fee paid:                     ______  [ R  C  E ]
  exchange rate:                ______  [ R  C  E ]
  time from send to in hand:    ______  [ R  C  E ]
  transfers per month:          ______  [ R  C  E ]
  door to door collection:      ______  [ R  C  E ]   (receivers)
  manual hours per month:       ______  [ R  C  E ]   (compliance)

WHAT THEY HAD ALREADY DONE ABOUT IT   (rule 3.4)
  switched provider:      ______________________________
  money already spent:    ______________________________
  standing rule or workaround: _________________________
  service abandoned:      ______________________________
  corridor or deal refused: ____________________________   (compliance)

RANKING, AS THEY GAVE IT   (rule 3.5)
  position ___ of ___     what they placed above it: ____________________

ONLY THEN, THE READING   (written after the call, never during it)
  Claim 1   supports / contradicts / neutral    because: ______________________
  Claim 2   supports / contradicts / neutral    because: ______________________
  Claim 3   supports / contradicts / neutral    because: ______________________

COMMITMENT MADE   (an introduction made in front of you, a date in a diary, a document sent, a test agreed)
  ______________________________

SURPRISE   (written before it gets rationalised away)
  ______________________________

INTERVIEWER ERRORS   (leading questions asked, product named early, silences filled)
  ______________________________
```

### 19.3 The kill criteria scoreboard

Updated after every interview and not at the end. Status is one of: not tested, fired, did not fire.

| Rule | Fires when | Count so far | Status |
|---|---|---|---|
| K1 | 5 of 6 senders say it does not matter and none names an incident | __ of __ | not tested |
| K2 | 3 of 4 receivers say visibility is normal and none names an incident | __ of __ | not tested |
| K3 | 4 of 6 senders cannot recall the fee and never compared | __ of __ | not tested |
| K4 | fewer than 2 of 6 senders ever switched provider | __ of __ | not tested |
| K5 | every compliance respondent says nobody has raised it, n at least 2 | __ of __ | not tested |
| K6 | every compliance respondent ranks transparency fifth or sixth, n at least 2 | __ of __ | not tested |
| K7 | 5 of 6 senders rank the problem fourth or lower | __ of __ | not tested |
| K8 | 0 senders past the wall agreed to a dated testnet session | __ of __ | not tested |
| K9 | no compliance respondent names spend or a refused corridor, n at least 2 | __ of __ | not tested |
| K10 | fewer than 4 completed interviews by Sunday 11 October 2026 | __ | not tested |

### 19.4 The paragraph that goes into the submission

Written last, from 19.1, 19.2 and 19.3, and from nothing else. It is left as blanks here on purpose,
because there is nothing yet to write.

```
Between ____-__-__ and ____-__-__ the founder completed __ interviews: __ senders on the
__________ corridor, __ receivers in __________, and __ compliance staff at __________.
Approaches sent: __.  Replies: __.  Completed: __ of __.
Recruited through: ______________________________________.
Selection bias, stated before a reviewer finds it: ______________________________________.
Claim 1:  __ of __ ____________________________________.
Claim 2:  __ of __ ____________________________________.
Claim 3:  __ of __ ____________________, or: not tested, because only __ compliance
          interviews were completed.
Rules that fired: ____________.   Rules not tested: ____________.
What changed in the product or the plan as a result: ______________________________.
What remains unevidenced: ______________________________.
Method, thresholds and raw notes: docs/USER_INTERVIEWS.md, sections 18 and 19.
```

**This block stays empty until the interviews exist.** Filling any part of it in advance, even as a
placeholder with plausible-looking numbers, would make it indistinguishable from a result, and
somebody reading the file later, including the founder in week 7, would not be able to tell. The
format example in section 13 is labelled as invented for exactly this reason, and must be deleted
before anything is submitted anywhere.
