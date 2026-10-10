"use strict";
(function(){
  const edges=[];
  const nodes=new Set();

  function add(a,b,meta){
    const edge=Object.assign({a:a,b:b,kind:"normal",minLevel:null,note:""},meta||{});
    edges.push(edge);
    nodes.add(a);nodes.add(b);
  }
  function chain(list,meta){
    for(let i=0;i<list.length-1;i++) add(list[i],list[i+1],meta);
  }

  // North-west / starter area. Connections are explicit: no diagonal movement.
  add("Tramis Mansion","Guild Plaza",{dirA:"bottom",dirB:"top"});
  add("Guild Plaza","Arcarinas Square",{dirA:"bottom",dirB:"top"});
  add("Arcarinas Square","Mall Street",{dirA:"left",dirB:"right",exitA:["Mall Street"],exitB:["Arcarinas Square","Arcanias Square"]});
  add("Arcarinas Square","Summer Hill Street",{dirA:"right",dirB:"left",exitA:["Summerhill Street","Summer Hill Street"]});
  add("Arcarinas Square","Brynhildr Trisects",{dirA:"bottom",dirB:"top",exitA:["Brynhild T-sects","Brynhild Trisects","Brynhildr Trisects"],exitB:["Brinhilld","Brynhilld","Brynhild","Arcarinas Square"]});

  // Mall Street and Summer Hill Street do not have a downward exit.
  // Guild Plaza's left/right dungeon entrances are intentionally not connected.
  chain(["Waimea Gorge","Brunen Basin","Brynhildr Trisects","Aerial Forest","Linear Forest","Oblique Forest"]);
  chain(["Waimea Gorge","Death Valley","Router Valley","Aquilos Gorge","Mystra Hill","Mystra Basin","Luan Basin","Cyoren Forest","Shalo Forest","Belteranin Forest","Urail Valley","Ashton Basin"]);
  add("Brynhildr Trisects","Loem Valley");
  chain(["Loem Valley","Castella Forest","Callisto Gorge","Bernald Forest","Theglaia Forest","Othellos Forest","Stout Forest","Felix Forest","Curior Forest","Candy Vault"]);
  add("Oblique Forest","Loren Valley",{minLevel:50,note:"L50+"});

  // Jotunheim / Yvel routes.
  chain(["Loren Valley","Kramer Forest","Ivolgue","Empion Forest","Morpheus Forest","Edine Plains","Daniella Plains","Business Plains","Goofball Plains","Presenal Plains","Inkwell Plains","Sennin Valley","Velcro Forest","Clique Forest","Amelia Forest","Jotunheim"]);
  add("Morpheus Forest","Midori Spa",{kind:"special",note:"Midori Spa"});
  chain(["Morpheus Forest","Blackmail Forest","Shudbee Forest","Pindown Valley","Simpson Valley","Sheryle Forest","Nordis Valley","Lost Wedge Valley","Parade Valley","Sherwood Valley","Yvel"]);
  chain(["Bombile Plateau","Anzers Plateau","Siberas Plateau"]);
  chain(["Bombile Plateau","Monoroby Plateau","Mute Basin","Fies Plateau","Noctein Plateau","Rekiell Plateau","Verazium Plateau","Pamament Plateau","Ramia Plateau","Metapolis"]);
  add("Yvel","Siberas Plateau",{minLevel:100,note:"L100+"});
  add("Siberas Plateau","Fies Plateau");
  add("Amelia Forest","Mute Basin");
  chain(["Metapolis","Robern Plains","Arobec Plateau","Hellein Plateau"]);
  add("Metapolis","Big Apple Forest",{minLevel:100,note:"L100+"});

  // Central blue route.
  chain(["Bradlely Forest","Kryston Forest","Sheriff Forest","Telling Denver Lake","Gaudy Forest","Harrington Forest","Candy Vault","Alicia Forest","Realto Plains","Taisen Plains","Lombard Plains","Scorging Plains","Rudwork Path","Proteron Gorge","Skitchy Gorge","Titanus Plains","Eir"]);
  add("Candy Vault","Alicia Forest",{minLevel:30,note:"L30+"});
  chain(["Bradlely Forest","Belpharen Forest","Salem Valley","Witchwood Forest","Furanden Forest"]);
  chain(["Grudin Forest","Vargas Forest","Furanden Forest","Abundance Town"]);
  add("Witchwood Forest","Grudin Forest");

  // Central green routes into Essene.
  add("Gaudy Forest","Baskerville Forest");
  // Complete game MAP confirms north Baskerville and east Corlona only.
  add("Baskerville Forest","Shylphaen Forest",{dirB:"top",exitB:["Baskerville Forest"],verified:true,source:"利用者のゲーム内MAP確認（2026-10-10）"});
  add("Shylphaen Forest","Corlona Forest",{dirA:"right",exitA:["Corlona Forest"],exitB:["Shylphaen Forest","Sylphaen Forest"],verified:true,source:"利用者のゲーム内MAP確認（2026-10-10）"});
  // Prior Sylphaen–Berdena connection is omitted pending confirmation.
  chain(["Berdana Forest","Colorado Forest","Engrave Path","Essene"]);
  chain(["Baskerville Forest","Lavy Basin","Ashely Forest","Onix Hill","Paladino Grove","Engrave Path"]);
  chain(["Ashton Basin","Brolly Basin","Ashmon Hills","Bairyn Forest","Sudden Hill","Malian Forest","Trakian Path","Saifield Forest","Kastled Grove","Essene"]);
  add("Abundance Town","Ashmon Hills");
  chain(["Essene","Evergal Grove","Crossevon Path","Vriely Grove","Meryle Wood","Wavin Plains","Crosby Plains","Aristone Plains","Harquil Plains","Albatross City"]);

  // Oasis / desert.
  add("Taisen Plains","Oasis");
  chain(["Oasis","Turmeit Desert","Cretino Desert","Asherphel Desert","Emporanie Plateau","Taquestrim Plateau","Phildyeit Plateau","Alison Gorge","Heather Basin","Tanline Gorge"]);
  chain(["Tanline Gorge","Acidbath Valley","Chanthery Gorge"]);
  add("Chanthery Gorge","Clipper Plains",{minLevel:66,note:"L66+"});

  // South-east / Eir.
  chain(["Clipper Plains","Elwood Plains","Hiroshi Gorge","Bailey Plains","Hooters Plains","Tolkin Gorge","Rosetar Basin","Pharaday Gorge","Lifeline Basin","Clingon Plains"]);
  add("Bailey Plains","Eir");
  chain(["Eir","Darive Plains","Vanderull Plains","Templar Gorge","Celephane Gorge"]);
  add("Eir","Marque Basin");
  add("Marque Basin","Templar Gorge",{minLevel:90,note:"L90+"});

  // Dungeon entrances with a single valid overworld entry.
  // Generic Sleepless Grave is an alias of Entrance; keep the filmed directed entry only.
  // 2026-10-10 video: observed entry and Level 1 round trip; no unobserved Eir return.
  add("Eir","Sleepless Grave (Entrance)",{kind:"dungeon",directed:true,exitA:["Sleepless Grave"],note:"動画で確認：Sleepless Graveの入口へ移動"});
  add("Sleepless Grave (Entrance)","Sleepless Grave (Level 1)",{kind:"dungeon",dirA:"top",dirB:"bottom",note:"動画で確認：入口の奥の門とLevel 1の戻りポータル"});
  add("Sleepless Grave (Level 1)","Sleepless Grave (Level 2)",{kind:"dungeon",directed:true,note:"動画で確認：格子の壁際からLevel 2へ。戻り経路は未確認"});
  add("Turmeit Desert","Sand Desert Dungeon",{kind:"dungeon",note:"Turneit Desertからのみ入場"});
  add("Shenzhen Waterfall","Temple of Pansidia",{kind:"dungeon",note:"Shenzhen Waterfallからのみ入場"});

  // Far east.
  chain(["Amorica Forest","Bangle Valley","Madrigras Valley","Tincrush Valley","Hardina Forest","Lithroid Forest","Big Apple Forest","Odalisque Forest","Premusson Path","Edgelderin Plains","Celephane Gorge"]);
  add("Edgelderin Plains","Village of the Dead",{kind:"special",note:"Ammeroid Chapel"});
  add("Big Apple Forest","Metapolis",{minLevel:100,note:"L100+"});

  // Shenzhen / Xiamen / Craving route.
  chain(["Shenzhen Canyon","Shenzhen Valley","Shenzhen Canyon Exit","Shenzhen Waterfall Entrance","Shenzhen Waterfall","Shenzhen Waterfall Exit","Shenzhen Forest"]);
  chain(["Shenzhen Canyon","Shenzhen Canyon Entrance","Prophet of Shenzhen","Xiamen Exit","Xiamen Main Gate","Xiamen","Ibarra Canyon Exit","Thorn Basin","Thorny Canyon","Corridor of Thorns","Ibarra Canyon Entrance","Craving Basin Exit","Corridor of Craving","Craving Canyon","Craving Basin Entrance","Yellow Gate"]);
  add("Yellow Gate","Albatross City");

  // User-confirmed: Lava Valley southwest gate leads to Lava Mountain Exit. Return passage not yet verified.
  add("Lava Valley","Lava Mountain Exit",{verified:true,directed:true,bidirectional:false,dirA:"bottom-left",exitA:["Lava Mountain -Exit-","Lava Mountain Exit"],source:"利用者のゲーム内確認"});

  // Dragon area / transport.
  add("Shenzhen Forest","Gefe Camp",{minLevel:125,note:"L125+"});
  add("Gefe Camp","Hidden Dock");
  add("Hidden Dock","Floating Island of Dragons Dock",{kind:"dock"});
  add("Floating Island of Dragons Dock","Dragons' Head",{kind:"dock"});
  add("Dragons' Head","Dragons' Village");
  add("Dragons' Village","Dragons' Tail");
  add("Dragons' Village","Dragons' Right Wing");
  add("Dragons' Village","Dragons' Back");
  add("Dragons' Village","Dragons' Left Wing");

  // Essene NPC transport: Expedition Transporter Garcia, level 100+.
  add("Essene","Airship Boarding Gate",{kind:"transport",minLevel:100,note:"Expedition Transporter Garcia / L100+"});
  add("Airship Boarding Gate","Floating Island of Dragons Dock",{kind:"transport",note:"Airship"});

  const aliases={
    "sylphaen forest":"Shylphaen Forest",
    "shylphaen forest":"Shylphaen Forest",
    "pladino grove":"Paladino Grove",
    "paladino grove":"Paladino Grove",
    "ashley forest":"Ashely Forest",
    "ashely forest":"Ashely Forest",
    "berdena forest":"Berdana Forest",
    "berdana forest":"Berdana Forest",
    "rosestar basin":"Rosetar Basin",
    "rosetar basin":"Rosetar Basin",
    "chingon plains":"Clingon Plains",
    "clingon plains":"Clingon Plains",
    "brynhilld":"Arcarinas Square",
    "brynhild":"Arcarinas Square",
    "brinhilld":"Arcarinas Square",
    "brynnhild":"Arcarinas Square",
    "brynhildr":"Arcarinas Square",
    "toisen plains":"Taisen Plains",
    "taisen plains":"Taisen Plains",
    "costella forest":"Castella Forest",
    "castella forest":"Castella Forest",
    "theglia forest":"Theglaia Forest",
    "theglaia forest":"Theglaia Forest",
    "bradley forest":"Bradlely Forest",
    "bradlely forest":"Bradlely Forest",
    "arcanias square":"Arcarinas Square",
    "arcarias square":"Arcarinas Square",
    "arcana square":"Arcarinas Square",
    "arcana's square":"Arcarinas Square",
    "arclinas square":"Arcarinas Square",
    "arcarinas square":"Arcarinas Square",
    "summerhill street":"Summer Hill Street",
    "summer hill street":"Summer Hill Street",
    "jotunnheim":"Jotunheim",
    "jotun heim":"Jotunheim",
    "midori spa":"Midori Spa",
    "dragon's village":"Dragons' Village",
    "dragons village":"Dragons' Village",
    "dragon village":"Dragons' Village",
    "dragon's tail":"Dragons' Tail",
    "dragon's right wing":"Dragons' Right Wing",
    "dragon's back":"Dragons' Back",
    "dragon's left wing":"Dragons' Left Wing",
    "dragon's dock/head":"Floating Island of Dragons Dock",
    "dragons dock/head":"Floating Island of Dragons Dock",
    "dragons dock":"Floating Island of Dragons Dock",
    "dragon's dock":"Floating Island of Dragons Dock",
    "floating island of dragons dock":"Floating Island of Dragons Dock",
    "air ship boarding gate":"Airship Boarding Gate",
    "airship boarding gate":"Airship Boarding Gate",
    "turneit desert":"Turmeit Desert",
    "turmeit desert":"Turmeit Desert",
    "sleepless grave entrance":"Sleepless Grave (Entrance)",
    "sleepless grave level 1":"Sleepless Grave (Level 1)",
    "sleepless grave":"Sleepless Grave (Entrance)",
    "sand desert":"Sand Desert Dungeon",
    "sand desert dungeon":"Sand Desert Dungeon",
    "temple of pansidia":"Temple of Pansidia"
  };

  window.XEN_WORLD_ROUTES={
    version:10,
    source:"Makise Xen Rebirth World Map (user supplied)",
    movement_rule:"orthogonal-explicit-only",
    nodes:Array.from(nodes).sort(function(a,b){return a.localeCompare(b,"en");}),
    edges:edges,
    aliases:aliases
  };
})();