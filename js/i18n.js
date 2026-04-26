/* i18n – English / Japanese translations */
(function () {
  'use strict';

  var strings = {
    en: {
      /* ---- Title screen ---- */
      title: 'Momoko in Space!',
      titleSubtitle: '~ A Comfortable Cosmic RPG ~',
      play: 'Play',
      howToPlay: 'How to Play',
      instructions: 'Float: Arrow Keys / D-Pad\nTalk / Interact: Space / Talk Button\nVisit friends and explore the stars!',
      language: 'Language',
      langLabel: 'EN',
      rotateHint: 'Please rotate your device to landscape mode!',
      bubbleBtn: 'TALK',
      soundOn: 'Sound: ON',
      soundOff: 'Sound: OFF',

      /* ---- Intro / backstory ---- */
      introTitle: "Momoko's Space Tale",
      introText: "Far out among the stars, a little ringed planet is home to Momoko.\nShe is the galaxy's Peach Princess – small but brave.\n\nHer neighbor Lila waves from the house next door.\nHer best friend MigWord lives all the way up on the Cheese Moon!\n\nMomoko just got her very own rocket ship.\nIt's time to float through town, visit her friends,\ndecorate the houses, and fly to the stars.\n\nAre you ready to explore with her?",
      continueBtn: 'Continue',

      /* ---- HUD / gameplay ---- */
      paused: 'Paused',
      resume: 'Resume',
      quit: 'Quit',

      /* ---- Game over / victory ---- */
      gameOver: 'Game Over',
      tryAgain: 'Try Again',
      victory: 'Victory!',
      savedOcean: 'You brought cheer to the galaxy!',
      playAgain: 'Play Again',
      thanks: 'Thank you for playing!',

      /* ---- Rings-view cutscene (repurposed from beach) ---- */
      beachTitle: 'The Planet Rings!',
      beachTitleAlt1: 'Starry Overlook!',
      beachTitleAlt2: 'Hello, Cosmos!',
      beachTitleAlt3: 'Sky-High View!',
      beachText: 'Look at the beautiful planet rings!\nLet\'s float back down to the town.',
      beachTextAlt1: 'The stars twinkle so bright up here!\nThere\'s still so much to explore below…',
      beachTextAlt2: 'Your pet dog is wagging its tail!\nLet\'s head back to see Lila!',
      beachTextAlt3: 'The planet glows below…\nReady to float down again?',
      back: 'Float Back',

      /* ---- Customization ---- */
      customize: 'Customize Momoko',
      presets: 'Quick Styles',
      hairColor: 'Hair',
      suitColor: 'Suit',
      skinTone: 'Skin',
      startGame: 'Start!',
      presetOcean: 'Star Princess',
      presetExplorer: 'Nebula Explorer',
      presetRainbow: 'Cosmic Diver',
      presetCoral: 'Moon Queen',
      presetNight: 'Night Orbiter',
      /* Tab labels */
      tabHair: 'Hair',
      tabDress: 'Dress',
      tabSwim: 'Space Suit',
      tabShoes: 'Boots',
      tabCrab: 'Pet Dog',
      tabFood: 'Snack',
      /* Variant names */
      varTwinTails: 'Twin-Tails',
      varLongBraids: 'Long Braids',
      varBuns: 'Twin Buns',
      varFrillyDress: 'Frilly',
      varSailorDress: 'Sailor',
      varStarDress: 'Star',
      varSailorSwimsuit: 'Cadet Astro',
      varOnePiece: 'Sleek Jumpsuit',
      varFrillyBikini: 'Sparkle Astro',
      varMaryJane: 'Mary-Jane',
      varSneaker: 'Sneaker',
      varFlipper: 'Moon Boot',
      varNone: 'None',
      varCrabRed: 'Brown',
      varCrabBlue: 'Spotted',
      varCrabGold: 'Golden',
      varIceCream: 'Ice Cream',
      varOnigiri: 'Onigiri',
      varDonut: 'Donut',
      varCrepe: 'Crepe',
      varTaiyaki: 'Taiyaki',
      varParfait: 'Parfait',
      varMacaron: 'Macaron',
      varStrawberry: 'Strawberry',

      /* ---- NPC dialogue ---- */
      oliverGreet: 'Hey Momoko! Want to hear a joke?',
      kittyGreet: "Hi! I'm Kitty Corn! I love watching shooting stars with you!",
      kittyHint: 'If you see a comet, make a wish! It always works!',
      bobGreet: "Ahoy! I'm Bob the space expert! Did you know…",
      crabName: 'Pet Dog',
      lilaGreet: "Hi Momoko! I lost my 5 starry gems somewhere in town. Can you help me find them?",
      lilaThanks: "You found them ALL! You're the best neighbor ever!",
      migwordGreet: 'Mmm! I\'m MigWord! My 3 mouse pals — Pip, Sprout and Tilly — are hiding around the moon. Can you go say hi to all 3 for me?',
      migwordThanks: 'You met all my mouse pals?! They told me you were the kindest visitor ever. Thank you!',
      mouseName: 'Moon Mouse',
      mouseGreet: 'Squeak! Hello there! Tell MigWord I said hi!',
      mouseGreet_pip: "I'm Pip! I was nibbling moon cheese — squeak hi to MigWord for me!",
      mouseGreet_sprout: "I'm Sprout! I love hiding by craters. Tell MigWord I'm safe!",
      mouseGreet_tilly: "I'm Tilly! Are you Momoko? MigWord talks about you all the time!",
      mouseAgain: 'Squeak squeak! Nice to see you again!',
      rocketPrompt: 'Press UP or tap to enter the rocket!',
      houseDoorPrompt: 'Press UP or tap to go inside!',
      cafeHint: 'Walk around with the D-pad — tap the door to leave',
      shopHint: 'Tap an item to buy it. Carry it home to a house!',
      shopCart: 'Cart:',
      shopCartEmpty: 'Tap an item below to take it home.',
      shopDeliveryTitle: '★ Delivery!',
      shopDeliveryDesc: 'Walk to a house door,\npress UP to drop off.',
      cafeBuyPrompt: 'TAP / TALK',
      cafeYum: 'Yum!',
      exitButton: 'EXIT',

      /* ---- Travel menu ---- */
      travelMenuTitle: 'Where to?',
      destHerosPlanet: "Ring Planet (Home)",
      destCheeseMoon: 'Cheese Moon',
      travelConfirm: 'Launch!',
      travelCancel: 'Cancel',
      rocketLaunching: 'Launching…',
      rocketArriving: 'Landing…',

      /* ---- House interior ---- */
      houseHero: "Momoko's House",
      houseLila: "Lila's House",
      houseMigword: "MigWord's Cheese Cottage",
      furnitureTabTitle: 'Place Furniture',
      furnitureExit: 'Go Outside',
      furnitureClear: 'Clear All',
      /* Category labels */
      furnitureCat_sleep: 'Sleep',
      furnitureCat_seat: 'Seating',
      furnitureCat_tables: 'Tables',
      furnitureCat_light: 'Lighting',
      furnitureCat_decor: 'Decor',
      furnitureCat_plants: 'Plants',
      furnitureCat_tech: 'Tech',
      furnitureCat_store: 'Storage',
      /* Item labels (key is furniture_<type>) */
      furniture_bed: 'Bed',
      furniture_chair: 'Chair',
      furniture_sofa: 'Sofa',
      furniture_stool: 'Stool',
      furniture_table: 'Table',
      furniture_coffeeTable: 'Coffee',
      furniture_desk: 'Desk',
      furniture_lamp: 'Lamp',
      furniture_ceilingLight: 'Pendant',
      furniture_candle: 'Candles',
      furniture_painting: 'Painting',
      furniture_rug: 'Rug',
      furniture_mirror: 'Mirror',
      furniture_plant: 'Plant',
      furniture_flowers: 'Flowers',
      furniture_tv: 'TV',
      furniture_bookshelf: 'Bookshelf',
      furniture_dresser: 'Dresser',
      /* Legacy labels — kept for any external reference */
      furnitureBed: 'Bed',
      furnitureTable: 'Table',
      furnitureChair: 'Chair',
      furnitureLamp: 'Lamp',
      furnitureRug: 'Rug',
      furniturePlant: 'Plant',
      furniturePainting: 'Painting',
      furnitureBookshelf: 'Bookshelf',

      /* ---- Quests ---- */
      questLilaTitle: "Lila's Lost Gems",
      questLilaProgress: "Lila's Gems:",
      questMigwordTitle: "MigWord's Mouse Pals",
      questMigwordProgress: "Mice Met:",

      /* ---- Overlay link ---- */
      backToGameCenter: '← Back to Game Center',

      /* ---- Oliver's silly jokes (20) – kid friendly ---- */
      joke1: 'Why did the toilet paper roll down the hill?\nTo get to the bottom!',
      joke2: "What's a pirate's favorite bathroom?\nThe POOP deck!",
      joke3: "Why don't skeletons ever poop?\nThey have no guts!",
      joke4: 'What did one toilet say to the other?\n"You look a little flushed!"',
      joke5: 'Why did the poop cross the road?\nBecause it was on a roll!',
      joke6: 'What do you call a dinosaur that farts?\nA blast-o-saurus!',
      joke7: "What's brown and sticky?\nA stick!",
      joke8: 'How do aliens go to the bathroom?\nThey UFO-ver it!',
      joke9: 'Why do farts smell?\nSo deaf noses can enjoy them too!',
      joke10: "What's invisible and smells like bananas?\nMonkey burps!",
      joke11: "What do you call a planet's fart?\nA gas giant!",
      joke12: 'Why did the banana go to the bathroom?\nIt really had to split!',
      joke13: 'Why did the kid bring toilet paper to the party?\nHe was a party pooper!',
      joke14: "What's brown and loud?\nA tuba full of chocolate pudding!",
      joke15: 'Why did the fly land on the poo?\nIt wanted a stinky snack!',
      joke16: 'What do you call a smelly fairy?\nStinker Bell!',
      joke17: 'How do you make a tissue dance?\nPut a little boogie in it!',
      joke18: 'What do you call a nervous toilet?\nA potty-panic!',
      joke19: "Why don't astronauts fart in space?\nBecause nobody can hear you BOOM!",
      joke20: "What do Martians call their bathroom?\nThe CRATER-room!",

      /* ---- Bob's space facts (5) ---- */
      fact1: 'A year on Mercury is only 88 Earth days long!',
      fact2: 'Jupiter has 95 moons – that\'s a lot of nightlights!',
      fact3: 'On Venus it rains sulfuric acid. Yuck!',
      fact4: 'Saturn\'s rings are made of billions of ice and rock chunks!',
      fact5: 'A day on Jupiter is less than 10 hours long – super speedy spin!',

      /* ---- Pet dog jokes (8) (key stays crabJoke* for now) ---- */
      crabJoke1: 'What do dogs eat at the movies?\nPUP-corn!',
      crabJoke2: 'What kind of dog loves space?\nAn AST-ro-naut!',
      crabJoke3: 'Why did the space dog sit on the rocket?\nIt wanted to take off!',
      crabJoke4: 'What\'s a dog\'s favorite planet?\nPLUTO, of course!',
      crabJoke5: 'What do you call a dog on the moon?\nA howl-o-naut!',
      crabJoke6: 'Why was the puppy a great pilot?\nHe had PAW-sitive vibes!',
      crabJoke7: 'What did the dog say to the star?\n"You\'re PAW-some!"',
      crabJoke8: 'Why are space dogs so good at fetch?\nZero gravity throws!',
    },

    ja: {
      /* ---- タイトル画面 ---- */
      title: 'モモコのうちゅうたんけん！',
      titleSubtitle: '〜 ほしぞらの やさしい RPG 〜',
      play: 'スタート',
      howToPlay: 'あそびかた',
      instructions: 'うかぶ: やじるしキー / 十字ボタン\nはなす: スペース / はなすボタン\nともだちに あいに いこう！ほしも たんけんしよう！',
      language: 'ことば',
      langLabel: 'JP',
      rotateHint: 'デバイスを よこむきにしてください！',
      bubbleBtn: 'はなす',
      soundOn: 'おと: オン',
      soundOff: 'おと: オフ',

      /* ---- イントロ / ものがたり ---- */
      introTitle: 'モモコの うちゅうものがたり',
      introText: 'とおい ほしぞらの むこうに わっかのある ちいさなほしが あります。\nそこが モモコの おうち。モモコは ぎんがの ももプリンセス。\nちいさいけれど とても ゆうかんです。\n\nおとなりの ライラが 「こんにちは！」と てをふっているよ。\nなかよしの ミグワードは とおくの チーズムーンに すんでいるよ！\n\nモモコは じぶんの ロケットを もらいました。\nまちを ふわふわ とびまわって ともだちに あって\nおうちを かわいく して ほしの せかいへ とびたとう！\n\nいっしょに たんけんしてくれる？',
      continueBtn: 'つぎへ',

      /* ---- HUD / ゲームプレイ ---- */
      paused: 'ポーズ',
      resume: 'つづける',
      quit: 'やめる',

      /* ---- ゲームオーバー / 勝利 ---- */
      gameOver: 'ゲームオーバー',
      tryAgain: 'もういちど',
      victory: 'やったー！',
      savedOcean: 'ぎんがに えがおが あふれたよ！',
      playAgain: 'もういちど あそぶ',
      thanks: 'あそんでくれて ありがとう！',

      /* ---- リングビュー ---- */
      beachTitle: 'ほしの わっか！',
      beachTitleAlt1: 'ほしぞら ながめ！',
      beachTitleAlt2: 'うちゅう こんにちは！',
      beachTitleAlt3: 'たかい たかい ながめ！',
      beachText: 'ほしの わっかが きれいだよ！\nまちに もどろう。',
      beachTextAlt1: 'ほしが ピカピカ ひかってる！\nしたには まだ みるもの たくさん！',
      beachTextAlt2: 'ワンちゃんが しっぽを ふってる！\nライラに あいに いこう！',
      beachTextAlt3: 'ほしが キラキラ ひかってるよ…\nもう いちど ふわふわ したへ？',
      back: 'したへ もどる',

      /* ---- カスタマイズ ---- */
      customize: 'モモコをカスタマイズ',
      presets: 'クイックスタイル',
      hairColor: 'かみ',
      suitColor: 'スーツ',
      skinTone: 'はだ',
      startGame: 'スタート！',
      presetOcean: 'ほしのプリンセス',
      presetExplorer: 'ネビュラたんけんか',
      presetRainbow: 'コスミックダイバー',
      presetCoral: 'つきのじょおう',
      presetNight: 'ナイトオービター',
      /* タブ */
      tabHair: 'かみがた',
      tabDress: 'ドレス',
      tabSwim: 'うちゅうふく',
      tabShoes: 'ブーツ',
      tabCrab: 'ワンちゃん',
      tabFood: 'おやつ',
      /* バリエーション */
      varTwinTails: 'ツインテール',
      varLongBraids: 'ながいみつあみ',
      varBuns: 'おだんご',
      varFrillyDress: 'フリル',
      varSailorDress: 'セーラー',
      varStarDress: 'スター',
      varSailorSwimsuit: 'カデットスーツ',
      varOnePiece: 'うちゅうじゃんぱー',
      varFrillyBikini: 'キラキラスーツ',
      varMaryJane: 'ストラップ',
      varSneaker: 'スニーカー',
      varFlipper: 'ムーンブーツ',
      varNone: 'なし',
      varCrabRed: 'ちゃいろ',
      varCrabBlue: 'ぶち',
      varCrabGold: 'きんいろ',
      varIceCream: 'アイス',
      varOnigiri: 'おにぎり',
      varDonut: 'ドーナツ',
      varCrepe: 'クレープ',
      varTaiyaki: 'たいやき',
      varParfait: 'パフェ',
      varMacaron: 'マカロン',
      varStrawberry: 'いちご',

      /* ---- NPC ---- */
      oliverGreet: 'やあ モモコ！ジョークをきく？',
      kittyGreet: 'こんにちは！キティコーンだよ！モモコと ながれぼしを みるのが だいすき！',
      kittyHint: 'すいせいを みたら おねがいごとを しようね！きっと かなうよ！',
      bobGreet: 'やあ！うちゅうのはかせ、ボブだよ！しってた？',
      crabName: 'ワンちゃん',
      lilaGreet: 'モモコ！キラキラほうせきを 5こ まちのなかで なくしちゃったの。いっしょに さがしてくれる？',
      lilaThanks: 'ぜんぶ みつけてくれた！モモコは さいこうの おとなりさんだよ！',
      migwordGreet: 'やあ！ミグワードだよ！ともだちの ねずみが 3びき つきの どこかに かくれちゃった。ピップと スプラウトと ティリーに 「やあ」って いってきてくれる？',
      migwordThanks: '3びき みんなに あえたの！？モモコの ことを やさしいって いってたよ。ありがとう！',
      mouseName: 'つきねずみ',
      mouseGreet: 'チューッ！こんにちは！ミグワードに よろしくね！',
      mouseGreet_pip: 'ぼくは ピップ！つきチーズを かじってたよ。ミグワードに げんきって つたえてね！',
      mouseGreet_sprout: 'わたしは スプラウト！クレーターの そばが だいすき！ぶじだよって おしえて！',
      mouseGreet_tilly: 'わたしは ティリー！モモコだよね？ミグワードが いつも はなしてるよ！',
      mouseAgain: 'チューチュー！また あえて うれしいな！',
      rocketPrompt: 'うえキー か タップで ロケットに のろう！',
      houseDoorPrompt: 'うえキー か タップで なかに はいろう！',
      cafeHint: '十字キーで あるけるよ — ドアを タップで でられるよ',
      shopHint: 'かぐを タップで かおう。おうちまで はこんでね！',
      shopCart: 'カート:',
      shopCartEmpty: 'した の かぐを タップして もちかえろう。',
      shopDeliveryTitle: '★ おとどけ！',
      shopDeliveryDesc: 'おうちの ドアまで あるいて\nうえキーで わたそう。',
      cafeBuyPrompt: 'タップ／はなす',
      cafeYum: 'おいしい！',
      exitButton: 'でる',

      /* ---- とらべるメニュー ---- */
      travelMenuTitle: 'どこへ いく？',
      destHerosPlanet: 'わっかのほし（おうち）',
      destCheeseMoon: 'チーズムーン',
      travelConfirm: 'はっしゃ！',
      travelCancel: 'キャンセル',
      rocketLaunching: 'はっしゃちゅう…',
      rocketArriving: 'ちゃくりくちゅう…',

      /* ---- おうちのなか ---- */
      houseHero: 'モモコのおうち',
      houseLila: 'ライラのおうち',
      houseMigword: 'ミグワードのチーズハウス',
      furnitureTabTitle: 'かぐを おこう',
      furnitureExit: 'そとへ でる',
      furnitureClear: 'ぜんぶ けす',
      /* カテゴリー */
      furnitureCat_sleep: 'ねる',
      furnitureCat_seat: 'すわる',
      furnitureCat_tables: 'テーブル',
      furnitureCat_light: 'あかり',
      furnitureCat_decor: 'かざり',
      furnitureCat_plants: 'しょくぶつ',
      furnitureCat_tech: 'でんき',
      furnitureCat_store: 'しゅうのう',
      /* かぐの なまえ */
      furniture_bed: 'ベッド',
      furniture_chair: 'いす',
      furniture_sofa: 'ソファ',
      furniture_stool: 'スツール',
      furniture_table: 'テーブル',
      furniture_coffeeTable: 'コーヒー',
      furniture_desk: 'つくえ',
      furniture_lamp: 'ランプ',
      furniture_ceilingLight: 'シャンデリア',
      furniture_candle: 'キャンドル',
      furniture_painting: 'え',
      furniture_rug: 'ラグ',
      furniture_mirror: 'かがみ',
      furniture_plant: 'しょくぶつ',
      furniture_flowers: 'おはな',
      furniture_tv: 'テレビ',
      furniture_bookshelf: 'ほんだな',
      furniture_dresser: 'タンス',
      /* Legacy */
      furnitureBed: 'ベッド',
      furnitureTable: 'テーブル',
      furnitureChair: 'いす',
      furnitureLamp: 'ランプ',
      furnitureRug: 'ラグ',
      furniturePlant: 'しょくぶつ',
      furniturePainting: 'え',
      furnitureBookshelf: 'ほんだな',

      /* ---- クエスト ---- */
      questLilaTitle: 'ライラの ほうせきさがし',
      questLilaProgress: 'ライラのほうせき:',
      questMigwordTitle: 'ミグワードのねずみさがし',
      questMigwordProgress: 'あえたねずみ:',

      /* ---- オーバーレイリンク ---- */
      backToGameCenter: '← ゲームセンターへ',

      /* ---- オリバーのジョーク (20) ---- */
      joke1: 'トイレットペーパーは なぜ さかを ころがったの？\nいちばん したへ いきたかったから！',
      joke2: 'かいぞくの だいすきな トイレは？\nうんちデッキ！',
      joke3: 'ガイコツは なぜ うんちを しないの？\nないぞうが ないから！',
      joke4: 'トイレが もう ひとつの トイレに なんていった？\n「かおが まっかだよ！」',
      joke5: 'うんちが どうろを わたったのは なぜ？\nころころ ころがってたから！',
      joke6: 'おならを する きょうりゅうは？\nブーブーザウルス！',
      joke7: 'ちゃいろくて ネバネバ するのは なに？\nえだ！',
      joke8: 'エイリアンは どこで トイレに いくの？\nUFO-バーするよ！',
      joke9: 'おならは なぜ くさいの？\nはなが きこえない ひとも たのしめるように！',
      joke10: 'みえなくて バナナの においが するのは？\nサルの ゲップ！',
      joke11: 'ほしの おならは なんていう？\nガスきょせい！',
      joke12: 'バナナが トイレに いったのは なぜ？\nわかれたく なったから！',
      joke13: 'こどもが パーティーに トイレットペーパーを もってきたのは なぜ？\nパーティーを ぶちこわす ひと だったから！',
      joke14: 'ちゃいろくて うるさいのは？\nチョコプリンが いっぱいの トランペット！',
      joke15: 'ハエは なぜ うんちに とまるの？\nくさい おやつが すきだから！',
      joke16: 'くさい ようせいは だれ？\nスティンカーベル！',
      joke17: 'ティッシュを おどらせるには？\nはなくそを ちょっと いれて！',
      joke18: 'こわがりの トイレは？\nドキドキ ポッティ！',
      joke19: 'うちゅうひこうしは なぜ うちゅうで おならしないの？\nブーンって きこえちゃうから！',
      joke20: 'かせいじんの トイレは なんていう？\nクレータールーム！',

      /* ---- ボブの宇宙知識 (5) ---- */
      fact1: 'すいせいの 1ねんは ちきゅうの 88にち だけなんだよ！',
      fact2: 'もくせいには 95こも つきが あるよ！よるが にぎやか！',
      fact3: 'きんせいでは りゅうさんの あめが ふるんだよ！こわい！',
      fact4: 'どせいの わっかは こおりと いわの つぶが いくじゅうおくも あつまっているよ！',
      fact5: 'もくせいの 1にちは 10じかんも ないよ！すごい スピードで まわるんだ！',

      /* ---- ワンちゃんジョーク (8) ---- */
      crabJoke1: 'ワンちゃんは えいがかんで なにを たべる？\nワンコーン！',
      crabJoke2: 'うちゅうが すきな イヌは？\nアストロ・ワン！',
      crabJoke3: 'うちゅういぬが ロケットに すわったのは なぜ？\nとびたちたかったから！',
      crabJoke4: 'イヌの すきな わくせいは？\nもちろん プルート！',
      crabJoke5: 'つきに いる イヌの よびかたは？\nハウル・オーノート！',
      crabJoke6: 'こいぬが パイロットに むいている りゆうは？\nポジティブな パウを もってるから！',
      crabJoke7: 'イヌが ほしに いった ことばは？\n「パウ・サム！」',
      crabJoke8: 'うちゅういぬは なぜ ボールあそびが じょうず？\nむじゅうりょく なげ！',
    }
  };

  var currentLang = 'en';

  window.Game = window.Game || {};
  window.Game.i18n = {
    lang: currentLang,

    setLanguage: function (lang) {
      if (strings[lang]) {
        currentLang = lang;
        this.lang = lang;
      }
    },

    toggleLanguage: function () {
      this.setLanguage(currentLang === 'en' ? 'ja' : 'en');
    },

    t: function (key) {
      return (strings[currentLang] && strings[currentLang][key]) ||
             (strings.en && strings.en[key]) ||
             key;
    },

    getJoke: function () {
      var n = Math.floor(Math.random() * 20) + 1;
      return this.t('joke' + n);
    },

    getFact: function () {
      var n = Math.floor(Math.random() * 5) + 1;
      return this.t('fact' + n);
    },

    getCrabJoke: function () {
      var n = Math.floor(Math.random() * 8) + 1;
      return this.t('crabJoke' + n);
    },

    /* alias for Phase 8 cleanup; keeps calls flexible */
    getPetJoke: function () {
      return this.getCrabJoke();
    }
  };
})();
