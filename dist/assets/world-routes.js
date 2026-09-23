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

  // North-west / starter area.
  chain(["Tramis Mansion","Guild Plaza","Arcarinas Square","Mall Street"]);
  add("Arcarinas Square","Summer Hill Street");
  add("Mall Street","Waimea Gorge");
  chain(["Waimea Gorge","Death Valley","Router Valley","Aquilos Gorge","Mystra Hill","Mystra Basin","Luan Basin","Cyoren Forest","Shalo Forest","Belteranin Forest","Urail Valley","Ashton Basin"]);
  chain(["Waimea Gorge","Brunen Basin","Brynhildr Trisects","Aerial Forest","Linear Forest","Oblique Forest"]);
  add("Summer Hill Street","Aerial Forest");
  add("Brynhildr Trisects","Loem Valley");
  chain(["Loem Valley","Costella Forest","Callisto Gorge","Bernald Forest","Theglia Forest","Othellos Forest","Stout Forest","Felix Forest","Curior Forest","Candy Vault"]);
  add("Oblique Forest","Loren Valley",{minLevel:50,note:"L50+"});

  // Jotunheim / Yvel routes.
  chain(["Loren Valley","Kramer Forest","Ivolgue","Empion Forest","Morpheus Forest","Edine Plains","Daniella Plains","Business Plains","Goofball Plains","Presenal Plains","Inkwell Plains","Sennin Valley","Velcro Forest","Clique Forest","Amelia Forest","Jotunheim"]);
  add("Morpheus Forest","Midori Spa",{kind:"special",note:"Midori Spa"});
  chain(["Morpheus Forest","Blackmail Forest","Shudbee Forest","Pindown Valley","Simpson Valley","Sheryle Valley","Nordis Valley","Lost Wedge Valley","Parade Valley","Sherwood Valley","Yvel"]);
  chain(["Bombile Plateau","Anzers Plateau","Siberas Plateau"]);
  chain(["Bombile Plateau","Monoroby Plateau","Mute Basin","Fies Plateau","Nocefin Plateau","Rekiel Plateau","Vergzium Plateau","Pagment Plateau","Ramia Plateau","Metapolis"]);
  add("Yvel","Siberas Plateau",{minLevel:100,note:"L100+"});
  add("Siberas Plateau","Fies Plateau");
  add("Amelia Forest","Mute Basin");
  chain(["Metapolis","Robern Plains","Arobac Plateau","Hellin Plateau"]);
  add("Metapolis","Big Apple Forest",{minLevel:100,note:"L100+"});

  // Central blue route.
  chain(["Bradley Forest","Kryston Forest","Sheriff Forest","Telling Denver Lake","Gaudy Forest","Harrington Forest","Candy Vault","Alicia Forest","Realto Plains","Toisen Plains","Lombard Plains","Scorging Plains","Rudwork Path","Proteron Gorge","Skitchy Gorge","Titanus Plains","Eir"]);
  add("Candy Vault","Alicia Forest",{minLevel:30,note:"L30+"});
  chain(["Bradley Forest","Belpharen Forest","Salem Valley","Witchwood Forest","Fraunden Forest"]);
  chain(["Grudin Forest","Vargas Forest","Fraunden Forest","Abundance Town"]);
  add("Witchwood Forest","Grudin Forest");

  // Central green routes into Essene.
  chain(["Gaudy Forest","Baskerville Forest","Sylphaen Forest","Berdena Forest","Colorado Forest","Engrave Path","Essene"]);
  chain(["Baskerville Forest","Lavy Basin","Ashley Forest","Onix Hill","Pladino Grove","Engrave Path"]);
  chain(["Ashton Basin","Brolly Basin","Ashmon Hills","Bairyn Forest","Sudden Hill","Malian Forest","Trakian Path","Saifield Forest","Kastled Grove","Essene"]);
  add("Abundance Town","Ashmon Hills");
  chain(["Essene","Evergal Grove","Crossevon Path","Vriely Grove","Meryle Wood","Wavin Plains","Crosby Plains","Aristone Plains","Harquil Plains","Albatross City"]);

  // Oasis / desert.
  add("Toisen Plains","Oasis");
  chain(["Oasis","Turneit Desert","Cretino Desert","Asherphel Desert","Emporanie Plateau","Taquestrim Plateau","Phildyeit Plateau","Alison Gorge","Heather Basin","Tanline Gorge"]);
  chain(["Tanline Gorge","Acidbath Valley","Chanthery Gorge"]);
  add("Chanthery Gorge","Clipper Plains",{minLevel:66,note:"L66+"});

  // South-east / Eir.
  chain(["Clipper Plains","Elwood Plains","Hiroshi Gorge","Bailey Plains","Hooters Plains","Tolkin Gorge","Rosestar Basin","Pharaday Gorge","Lifeline Basin","Chingon Plains"]);
  add("Bailey Plains","Eir");
  chain(["Eir","Darive Plains","Vanderull Plains","Templar Gorge","Celephane Gorge"]);
  add("Eir","Marque Basin");
  add("Marque Basin","Templar Gorge",{minLevel:90,note:"L90+"});

  // Far east.
  chain(["Amorica Forest","Bangle Valley","Madrigras Valley","Tincrush Valley","Hardina Forest","Lithroid Forest","Big Apple Forest","Odalisque Forest","Premusson Path","Edgelderin Plains","Celephane Gorge"]);
  add("Edgelderin Plains","Village of the Dead",{kind:"special",note:"Ammeroid Chapel"});
  add("Big Apple Forest","Metapolis",{minLevel:100,note:"L100+"});

  // Shenzhen / Xiamen / Craving route.
  chain(["Shenzhen Canyon","Shenzhen Valley","Shenzhen Canyon Exit","Shenzhen Waterfall Entrance","Shenzhen Waterfall","Shenzhen Waterfall Exit","Shenzhen Forest"]);
  chain(["Shenzhen Canyon","Shenzhen Canyon Entrance","Prophet of Shenzhen","Xiamen Exit","Xiamen Main Gate","Xiamen","Ibarra Canyon Exit","Thorn Basin","Thorny Canyon","Corridor of Thorns","Ibarra Canyon Entrance","Craving Basin Exit","Corridor of Craving","Craving Canyon","Craving Basin Entrance","Yellow Gate"]);
  add("Yellow Gate","Albatross City");

  // Dragon area / transport.
  add("Shenzhen Forest","Gefe Camp",{minLevel:125,note:"L125+"});
  chain(["Gefe Camp","Hidden Dock","Dragons' Dock/Head","Dragons' Village"]);
  chain(["Dragons' Village","Dragons' Tail"]);
  chain(["Dragons' Village","Dragons' Right Wing"]);
  chain(["Dragons' Village","Dragons' Back"]);
  chain(["Dragons' Village","Dragons' Left Wing"]);
  add("Essene","Hidden Dock",{kind:"transport",minLevel:100,note:"Airship / L100+"});

  const aliases={
    "arcanias square":"Arcarinas Square",
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
    "dragon's dock/head":"Dragons' Dock/Head"
  };

  window.XEN_WORLD_ROUTES={
    version:1,
    source:"Makise Xen Rebirth World Map (user supplied)",
    nodes:Array.from(nodes).sort(function(a,b){return a.localeCompare(b,"en");}),
    edges:edges,
    aliases:aliases
  };
})();