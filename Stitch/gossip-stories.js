// gossip lines, one story per day. lines come in pairs (setup, then twist)
// speaker names need to match the keys in speakers/voices
window.GOSSIP = {
  linesPerPop: 2,

  speakers: {
    'Auntie Wang': '#e8434f',
    'Auntie Li': '#2f5fd0',
    'Grandpa Zhang': '#3c8c3c',
  },

  // Mumble voice pitch (Hz) per speaker while their line types out. Unlisted speakers get a random-ish auntie pitch.
  voices: {
    'Auntie Wang': 300,
    'Auntie Li': 390,
    'Grandpa Zhang': 125,
  },

  days: {
    1: {
      title: "Old Chen's Daughter-in-Law",
      lines: [
        ['Auntie Wang', "Old Chen's son on the 3rd floor is getting married! She's a PhD back from abroad, pretty, kind, AND she cooks!"],
        ['Auntie Li', "Back from abroad? I watched her come back up out of the sewer. The manhole cover lifted itself."],

        ['Auntie Wang', "Don't be silly, she just bought Old Chen a gold bracelet. A whole kilo of it!"],
        ['Auntie Li', "The gold is real. She took it out of the safe under Old Chen's bed herself."],

        ['Auntie Wang', "Well... at least the young couple are sweet? Holding hands on every walk."],
        ['Auntie Li', "Sweet? The son told me he never proposed. He just woke up with a ring on his finger."],

        ['Auntie Wang', "Good grief, is the wedding still on?"],
        ['Auntie Li', "Oh, it's on. They swapped grooms. Old Chen's marrying her, the son's best man now."],

        ['Auntie Wang', "Old Chen is seventy! What does she want with him?"],
        ['Auntie Li', "His old flat, for the demolition payout. Then yesterday the notice came: no demolition."],

        ['Auntie Wang', "So she's running off now, surely?"],
        ['Auntie Li', "Nope. Says she's undercover, investigating the demolition office, and Old Chen is her new informant."],
      ],
    },

    2: {
      title: "Grandpa Zhang's Five Million",
      lines: [
        ['Auntie Li', "Did you see that wedding video? The one that the bride played a clip of the groom cheating."],
        ['Auntie Wang', "At their own wedding?"],

        ['Auntie Li', "Then the groom said, “I've got one too.”"],
        ['Auntie Wang', "The bride was cheating too?"],

        ['Auntie Li', "With the same person."],
        ['Auntie Wang', "No way. Who?"],

        ['Auntie Li', "The one who introduced them."],
        ['Auntie Wang', "?"]
      ],
    },

    3: {
      title: 'The Granny Across the Hall',
      lines: [
        ['Auntie Li', "Remember that wedding? They're staying together."],
        ['Auntie Wang', "After all that cheating?"],

        ['Auntie Li', "They compared notes. Both told their lover, “My partner died.”"],
        ['Auntie Wang', "Wow. Made for each other."],

        ['Auntie Li', "And their lover gave them each a card. “Buy yourself something nice.”"],
        ['Auntie Wang', "So what did they buy?"],

        ['Auntie Li', "The wedding. Half on each card."],
        ['Auntie Wang', "??"]
      ]
    },
  },
};
