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

The kit is sized for one person in Yogyakarta with a full-time job and about eight weeks.

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
caught, and the errors field is the only mechanism that improves the interviewing across eight weeks.

---

## 10. Tally across interviews

One row per interview, appended as they happen. This is the table that becomes the evidence summary,
so it must be maintained during the eight weeks and not reconstructed at the end.

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

## 11. How many interviews, and the eight weeks

Today is 2026-09-11 and the deadline is 2026-11-08, which is about eight weeks. The founder is one
person with a full-time job. Anything that assumes full-time research is a plan that will not be
executed, and a plan that is not executed produces the same evidence as no plan.

**Recommended target: 22 interviews, as 12 senders, 6 receivers, 4 compliance.**

That is about three a week including the ones that cancel, which is achievable in evenings and
weekends, and it is enough that a reviewer sees a pattern rather than three anecdotes.

**Credible floor: 14, as 8 senders, 4 receivers, 2 compliance.** Below eight senders it is difficult
to claim any pattern at all and the write-up has to be phrased as early signals. Below two compliance
interviews, Claim 3 stays unevidenced and the submission must say that plainly rather than stretching
the sender interviews to cover it.

**Ceiling: about 30.** Past that the marginal interview in a saturated group adds nothing to a
submission and costs time the rest of the application needs. If senders saturate early, spend the
remaining slots on compliance, which will not saturate.

**Why these numbers.** Group A is the easiest to reach, which is why it carries the most weight and
also why it is the least impressive on its own: reaching Indonesians who send money home is not a
credential. Group C is slow, needs lead time, and has a low reply rate, so four completed interviews
is an honest target for eight weeks and is worth more to a reviewer than the other eighteen combined,
because it is the group the proposal has nothing on. Group B sits in the middle and is mostly reached
through group A, which is a bias that section 13 has to state.

**Eight week shape.**

| Week | Work |
|---|---|
| 1 | Section 15 decisions made. Outreach for group C sent, all of it, because it has the longest lead time. First 2 sender interviews, treated as pilots for the script. |
| 2 | Revise script A from what the pilots exposed. 3 sender interviews. Chase group C. |
| 3 | 3 senders, first receiver introductions requested at the end of each. |
| 4 | 2 senders, 2 receivers. First compliance interview if one has landed. Mid-point review of the tally: are there any minus signs, and is the wall holding. |
| 5 | 2 senders, 2 receivers, 1 compliance. |
| 6 | 2 receivers, 1 to 2 compliance. Senders likely saturated, stop adding them. |
| 7 | Remaining compliance. Write up section 13 from the tally, with the numbers as they actually are. |
| 8 | Quote confirmations sent and returned. Findings folded into the proposal and the submission. Buffer, because something in this list will have slipped. |

Two notes on the shape. Group C outreach goes out in week 1 and not week 4, because a compliance
officer replying in three weeks is normal and a compliance officer replying in three days is not.
And the mid-point review in week 4 exists because the most common failure of a solo interview
programme is not too few interviews, it is fifteen interviews that all lead the witness the same way.

---

## 12. Recruiting, and the bias each channel creates

Every channel produces a skewed sample. That is unavoidable for one person in eight weeks and it is
not a problem, as long as the skew is stated in the write-up instead of being hidden. Write down the
exact channel per interview in the note template, not the category.

**Senders.** Indonesian worker communities abroad, which the founder can reach in Indonesian: diaspora
and migrant worker groups on Facebook and Telegram for Taiwan, Hong Kong, Singapore, Malaysia, South
Korea and Japan, student associations, hometown and religious community groups, and then referrals
from each completed interview, which is where the best ones come from. Filipino senders will be harder
without a Tagalog-speaking introducer, so either find one introducer or state honestly that the
Filipino side is thin. Do not pad the count with Filipino respondents recruited in English, because
that selects for office workers and not for the primary user.

*Bias this creates:* online community groups select for people who are comfortable online, connected,
and often already using apps rather than cash agents. The sample will under-represent the least
digital senders, which is precisely the group whose experience is worst. Say this.

**Receivers.** Ask at the end of every sender interview, question A39, and interview the receiver
separately. Also reachable directly through family and neighbourhood networks in Yogyakarta and
Central Java.

*Bias this creates:* receivers recruited through their own sender are selected for a good relationship
with that sender and will not speak freely about disagreements over money. Receivers in Java are not
receivers in NTT or Sulawesi, where the trip to a counter is longer and the collection problem is
worse. Both facts go in the write-up.

**Compliance.** LinkedIn approaches to named compliance and AML officers at Indonesian and Philippine
money transfer operators and remittance firms, Stellar anchors and their operations leads, compliance
consultants, the Stellar ecosystem contacts the founder already has including the SCF referrer, and
AML and fintech professional groups. Offer a 30 minute call, no recording, no attribution, and send
the questions in advance.

*Bias this creates:* people who accept a cold call from a founder building a privacy product are
predisposed to find privacy interesting. That is the worst possible bias for Claim 3 and it must be
stated in the write-up, and it is the reason question C13 is worded to ask what has already happened
rather than what they think.

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
   introducer it will not happen properly in eight weeks. The honest options are to find one introducer
   in week 1, or to scope this round to Indonesian senders and say so in the write-up. Do not fill the
   quota with English-speaking Filipino respondents and present them as the primary user.
6. **What result would change the plan.** Write the answer down now, before any data arrives, so it
   cannot be rationalised afterwards. Specifically: if senders do not care who sees the amount, does
   Tukar reposition around the compliance buyer, keep the consumer framing, or change corridors?
   Deciding this in advance is the difference between research and a search for supporting quotes.

One more thing that is not a decision but a warning. Section 13's honesty requirements only work if
they are settled before the findings exist. It is much easier to commit to reporting a disconfirming
result today than it is to do it in week 7 with a deadline coming.
