# Requisitos dos encontros únicos (lendários) do Quetzal, lidos da ROM: a tabela de 106 registros em 0x1992D6C e as
# funções que conferem o encontro (0x82AA894 e as 56 regras da tabela em 0x82AA270; ver as notas em RS e lines()).
# Grava src/data/quetzal-legend-rules.json (por região: johto, hoenn, kanto). Uso: python3 -I tools/quetzal-legend-rules.py [rom.gba]
# (padrão: fixtures/rom/PokemonQuetzalPtBrAlpha9v1.gba; a ROM nunca é versionada). Não conferido no jogo.
import json, os, struct, sys
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')+'/'
R=open(sys.argv[1] if len(sys.argv)>1 else ROOT+'fixtures/rom/PokemonQuetzalPtBrAlpha9v1.gba','rb').read()
Q=json.load(open(ROOT+'src/data/quetzal.json'))
SP=json.load(open(ROOT+'src/data/species.json'))
MV=json.load(open(ROOT+'src/data/moves.json'))
TYPES='Normal Fighting Flying Poison Ground Rock Bug Ghost Steel Mystery Fire Water Grass Electric Psychic Ice Dragon Dark Fairy'.split()
def u8(a): return R[a&0x1ffffff]
def u16(a): return struct.unpack_from('<H',R,a&0x1ffffff)[0]
def u32(a): return struct.unpack_from('<I',R,a&0x1ffffff)[0]
def spname(i):
    if i==0: return None
    if 1<=i<=898: return SP['species'][i][0] if isinstance(SP['species'],list) else SP['species'][str(i)][0]
    e=Q['species'].get(str(i))
    if not e: return f'species#{i}'
    return e[10] or e[0]
def itemname(i): return Q['items'][i] if i < len(Q['items']) else f'item#{i}'
def movename(i):
    if str(i) in Q['moveNames']: return Q['moveNames'][str(i)]
    m=MV['moves']
    if isinstance(m,list): v=m[i]
    else: v=m.get(str(i))
    if isinstance(v,list): v=v[0]
    if isinstance(v,dict): v=v.get('name')
    return v
def typename(t): return TYPES[t] if t<len(TYPES) else f'type#{t}'
CH={0:' ',0xAE:'-',0xB4:"'",0xAD:'.',0xB8:',',0xBA:'/',0xAB:'!',0xAC:'?',0xB0:'…',0xB5:'♂',0xB6:'♀'}
for i in range(26): CH[0xBB+i]=chr(65+i); CH[0xD5+i]=chr(97+i)
for i in range(10): CH[0xA1+i]=str(i)
def enc(s): 
    inv={v:k for k,v in CH.items()}; return bytes(inv[c] for c in s)
def dec(b):
    out=''
    for x in b:
        if x==0xFF: break
        out+=CH.get(x,'?')
    return out
_ov=R.find(enc('Overgrow')+b'\xff')
ABBASE=_ov-65*17
def abname(i): return dec(R[ABBASE+17*i:ABBASE+17*i+17])

BASE=0x1992D6C
T=typename
recs=[]
for i in range(106):
    a=BASE+32*i
    r=dict(g=u8(a),m=u8(a+1),obj=u8(a+2),sp=u16(a+4),lv=u16(a+6),fhide=u16(a+0xA),fdef=u16(a+0xC),fcau=u16(a+0xE),
           badges=u8(a+0x10),league=u8(a+0x11),type=u8(a+0x12),psp=u16(a+0x14),item=u16(a+0x16),flag=u16(a+0x18),
           var=u16(a+0x1A),vmin=u16(a+0x1C),mode=u8(a+0x1E),rule=u8(a+0x1F)>>2,low=u8(a+0x1F)&3)
    recs.append(r)
assert spname(recs[0]['sp'])=='Articuno' and spname(recs[105]['sp'])=='Pecharunt'
NOTYPE={2,4,10,11,12,14,15,16,18,20,29,30,31,32,33,34,35,36,39,40,41,42,43,44,45,50,52,53,54,55}

# ---- rule summaries (en) ----
RS={
0:("No requirement in the table check (always true).",["none"]),
1:("Genesect: all 6 party slots hold Fossil Pokémon (exact species list, forms not folded).",["slots 1-6: Omanyte, Omastar, Kabuto, Kabutops, Aerodactyl (or Mega), Lileep, Cradily, Anorith, Armaldo, Cranidos, Rampardos, Shieldon, Bastiodon, Tirtouga, Carracosta, Archen, Archeops, Tyrunt, Tyrantrum, Amaura, Aurorus, Dracozolt, Arctozolt, Dracovish, Arctovish (0x81bad14)"]),
2:("Regi trio/Regieleki/Regidrago: Wailord in slot 1, Relicanth in slot 6, slots 2-5 of the record type.",["slot 1 species == 321 (exact)","slot 6 species == 369 (exact)","slots 2-5 have record type (type1 or type2)"]),
3:("Regigigas: Wailord in slot 1, Relicanth in slot 6, slots 2-5 each one of Regirock/Regice/Registeel/Regieleki/Regidrago (base form).",["slot 1 == Wailord","slot 6 == Relicanth","slots 2-5 base form in {Regirock, Regice, Registeel, Regieleki, Regidrago}"]),
4:("All 6 party slots of the record type.",["6 non-empty, non-egg slots, each with record type (0x82a77d0)"]),
5:("Type: Null: all 6 are 'artificial' Pokémon.",["slots 1-6 base form in {Porygon, Porygon2, Porygon-Z, Mewtwo, Baltoy, Claydol, Castform, Golett, Golurk, Genesect, Type: Null, Silvally, Magearna}"]),
6:("Koraidon: in the past (flag 0x1318), Celebi in slot 1, past Paradox Pokémon in slots 2-6.",["flag 0x1318 set","slot 1 base form Celebi","slots 2-6 in {Great Tusk, Scream Tail, Brute Bonnet, Flutter Mane, Slither Wing, Sandy Shocks, Roaring Moon, Koraidon, Walking Wake, Gouging Fire, Raging Bolt}"]),
7:("Miraidon: in the future (flag 0x14aa), Celebi in slot 1, future Paradox Pokémon in slots 2-6.",["flag 0x14aa set","slot 1 Celebi","slots 2-6 in the future Paradox list (0x82a8b68: Iron Treads, Iron Bundle, Iron Hands, Iron Jugulis, Iron Moth, Iron Thorns, Iron Valiant, Miraidon, Iron Leaves, Iron Boulder, Iron Crown)"]),
8:("Zarude: Celebi story finished (var 0x5009 > 9), Celebi in slot 1, Grass in slots 2-6.",["var 0x5009 > 9","slot 1 Celebi","slots 2-6 Grass"]),
9:("Mew: all 6 know Transform.",["6 slots each know Transform"]),
10:("Tapus: slot 1 has the matching Surge ability, slots 2-6 of the record type (slot 1 type not checked).",["slot 1 ability: Tapu Koko Electric Surge, Tapu Lele Psychic Surge, Tapu Bulu Grassy Surge, Tapu Fini Misty Surge","slots 2-6 record type"]),
11:("Lake trio: all 6 Psychic, and all 4 moves of slot 1 belong to one contest category (Uxie Smart, Mesprit Cute, Azelf Tough).",["6 slots of record type (Psychic)","slot 1: each of its 4 moves has contest category Smart/Cute/Tough (table 0x91fd4ac byte1 & 7)"]),
12:("Dialga/Palkia: Uxie, Mesprit and Azelf caught or defeated; Uxie/Mesprit/Azelf in slots 1/2/3; slots 4-6 of the record type; all 6 know Trick Room.",["Uxie, Mesprit, Azelf done (0x82a904c)","slot 1 Uxie, slot 2 Mesprit, slot 3 Azelf (exact)","slots 4-6 record type","6 slots know Trick Room"]),
13:("Galarian birds: the Kanto bird of the same name caught or defeated; that Kanto bird in slot 1; slots 2-6 of the record type.",["Kanto bird done (0x82ab5dc)","slot 1 exactly Articuno/Zapdos/Moltres (144/145/146)","slots 2-6 record type"]),
14:("Treasures of Ruin: slot 1 of the record type holding its item, all 6 Dark.",["slot 1 record type holding Miracle Seed (Wo-Chien) / Never-Melt Ice (Chien-Pao) / Soft Sand (Ting-Lu) / Charcoal (Chi-Yu)","6 slots Dark"]),
15:("Zacian/Zamazenta: slot 1 knows Sacred Sword / King's Shield, slots 2-6 of the record type.",["slot 1 knows Sacred Sword (Zacian) or King's Shield (Zamazenta)","slots 2-6 record type"]),
16:("Reshiram/Zekrom: player avatar 30; all 6 have Pokédex color White / Black.",["SaveBlock2 byte 8 (avatar) == 30","6 slots body color White (Reshiram) / Black (Zekrom) (species info +0x1F & 0x7F)"]),
17:("Ogerpon: 6 Pokémon, each Grass, Water, Fire or Rock, with at least one of each.",["6 non-empty slots, each of type Grass/Water/Fire/Rock","at least one Grass, one Water, one Fire and one Rock"]),
18:("Loyal Three: Ogerpon caught or defeated; Ogerpon in slot 1 holding a mask; slots 2-6 of the record type.",["Ogerpon done (flags 0x12fc/0x12fd)","slot 1 Ogerpon holding Cornerstone Mask (Okidogi) / Wellspring Mask (Munkidori) / Hearthflame Mask (Fezandipiti)","slots 2-6 record type"]),
19:("Pecharunt: Ogerpon and the Loyal Three done; Ogerpon with Pecha Berry in slot 1, Okidogi/Munkidori/Fezandipiti in slots 2/3/4, Poison in slots 5-6.",["Ogerpon, Okidogi, Munkidori, Fezandipiti done (0x82a7f00)","slot 1 Ogerpon holding Pecha Berry","slot 2 Okidogi, slot 3 Munkidori, slot 4 Fezandipiti","slots 5-6 Poison"]),
20:("Forces of Nature (by species).",["Tornadus/Thundurus: 6 slots of record type, each knowing a move of that type","Landorus: slot 1 Tornadus, slot 2 Thundurus, slots 3-6 Ground","Enamorus: Tornadus, Thundurus, Landorus done (0x82a8638); slots 1/2/3 Tornadus/Thundurus/Landorus; slots 4-6 Fairy and female"]),
21:("Latias/Latios: avatar gender, flute in slot 1, all 6 of one gender.",["Latias: avatar NOT in set 0x81baa88 (inferred male set); slot 1 holds Red Flute; 6 slots female","Latios: avatar in set 0x81baa88; slot 1 holds Blue Flute; 6 slots male"]),
22:("Cosmog: Lunatone and Solrock in slots 1-2 (either order), Psychic in slots 3-6.",["slots 1-2 {Lunatone, Solrock}","slots 3-6 Psychic"]),
23:("Poipole: 6 different Poison Pokémon.",["6 slots Poison","base forms all distinct"]),
24:("Ultra Beasts: Cosmog done; Cosmog line in slot 1; slots 2-6 meet a species-specific test.",["Cosmog done (0x128a/0x128b)","slot 1 in {Cosmog, Cosmoem, Solgaleo, Lunala}","slots 2-6 non-empty and: Nihilego Tentacool/Tentacruel/Frillish/Jellicent; Buzzwole Bug+male; Pheromosa Bug+female; Xurkitree Electric+knows Charge; Celesteela knows Fly; Kartana knows a slicing move; Guzzlord ability Gluttony; Stakataka Rock or Steel and all the same species; Blacephalon knows Self-Destruct/Explosion/Misty Explosion"]),
25:("Necrozma: Cosmog and all Ultra Beasts done; Solgaleo or Lunala at level 100 in slot 1; 5 different Ultra Beasts in slots 2-6.",["Cosmog + Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Poipole, Stakataka, Blacephalon done (0x82a9e60)","slot 1 Solgaleo or Lunala, level 100","slots 2-6 in {Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Naganadel, Stakataka, Blacephalon}, distinct"]),
26:("Weather trio (by species).",["Groudon: has Red Orb (bag or held, 0x82a8198)","Kyogre: has Blue Orb, and (Groudon done or flag 0x1311 unset or no Red Orb)","Rayquaza: slot 1 Groudon, slot 2 Kyogre, slots 3-6 Dragon (+ mode 3)"]),
27:("Jirachi: all 6 know Wish.",["6 slots know Wish"]),
28:("Manaphy: all 6 Water and a Water-type Egg in special storage box 240.",["6 slots Water","one of the 30 entries of storage box id 0xF0 ([0x30055cc]+0x29f, 15-byte entries) is an egg whose species has type Water (identity of this box in game not established)"]),
29:("Legendary beasts and past Paradoxes (by species).",["Raikou/Entei/Suicune: not in the past (0x82a7890); slot 1 Jolteon/Flareon/Vaporeon (base form); slots 2-6 record type","Walking Wake/Gouging Fire/Raging Bolt: in the past; Koraidon done (0x12e7/0x12e8); slot 1 Celebi; slots 2-6 record type"]),
30:("Swords of Justice: slot 1 ability Justified, slots 2-6 of the record type.",["slot 1 ability Justified","slots 2-6 record type"]),
31:("Keldeo: Swords done; Cobalion/Terrakion/Virizion in slots 1/2/3 knowing Sacred Sword; Water in slots 4-6.",["Cobalion, Terrakion, Virizion done (0x82a8480)","slot 1 Cobalion, slot 2 Terrakion, slot 3 Virizion, each knows Sacred Sword","slots 4-6 Water"]),
32:("Future Paradoxes (Iron Leaves/Boulder/Crown): in the future, Miraidon done, Celebi in slot 1, slots 2-6 of the record type.",["flag 0x14aa","Miraidon done (0x12ea/0x12eb)","slot 1 Celebi","slots 2-6 record type"]),
33:("Giratina: Dialga and Palkia done; them in slots 1-2 (either order); Ghost in slots 3-6.",["Dialga, Palkia done","slots 1-2 {Dialga, Palkia}","slots 3-6 Ghost"]),
34:("Heatran: Fire in slots 1-3, Steel in slots 4-6.",["slots 1-3 Fire","slots 4-6 Steel"]),
35:("Cresselia: all 6 know Moonlight.",["6 slots know Moonlight"]),
36:("Darkrai: story flag 0x1425 only (party not checked).",["flag 0x1425 set"]),
37:("Shaymin: 6 different Grass Pokémon, slot 1 knows Sweet Scent.",["6 slots Grass, base forms distinct","slot 1 knows Sweet Scent"]),
38:("Kyurem: Reshiram and Zekrom done; them in slots 1-2 (either order); Ice in slots 3-6.",["Reshiram, Zekrom done","slots 1-2 {Reshiram, Zekrom}","slots 3-6 Ice"]),
39:("Kalos trio (by species): Unown letter in slot 1.",["Xerneas: slot 1 species 1023 (Unown X), slots 2-6 Fairy","Yveltal: slot 1 species 1024 (Unown Y), slots 2-6 Dark","Zygarde: Xerneas and Yveltal done; slot 1 species 1025 (Unown Z); slots 2-6 Ground or Dragon"]),
40:("Eternatus: Zacian and Zamazenta done; them in slots 1-2; slots 3-6 different Pokémon that are Gigantamax forms or can Gigantamax and have the Gigantamax Factor.",["Zacian, Zamazenta done","slots 1-2 {Zacian, Zamazenta}","slots 3-6: species flag 0x2000 (Gigantamax form) or (flag 0x1000 and Gigantamax Factor, mon byte 0x13 bit 6); base forms distinct"]),
41:("Kubfu: 6 different Fighting Pokémon.",["6 slots Fighting, base forms distinct"]),
42:("Glastrier: 6 different Ice Pokémon; slot 1 Attack > Sp. Atk and knows a physical Ice move.",["6 slots Ice, distinct","slot 1 Atk > SpA (party stats)","slot 1 knows an Ice move of physical category"]),
43:("Spectrier: 6 different Ghost Pokémon; slot 1 Sp. Atk > Attack and knows a special Ghost move.",["6 slots Ghost, distinct","slot 1 SpA > Atk","slot 1 knows a special Ghost move"]),
44:("Calyrex: Glastrier and Spectrier done; them in slots 1-2; Grass or Psychic in slots 3-6; all 6 hold different Berries.",["Glastrier, Spectrier done","slots 1-2 {Glastrier, Spectrier}","slots 3-6 Grass or Psychic","6 slots hold items of pocket Berries (4), all different"]),
45:("Terapagos: slot 1 Tera Stellar, slots 2-6 five different Tera types (not Stellar).",["6 slots with valid Tera type (mon byte 0x1F)","slot 1 Stellar","slots 2-6 distinct, not Stellar"]),
46:("Meloetta: all 6 know a dance move.",["6 slots each know one of Swords Dance, Petal Dance, Feather Dance, Teeter Dance, Dragon Dance, Lunar Dance, Quiver Dance, Fiery Dance, Revelation Dance, Clangorous Soul, Victory Dance, Aqua Step (move flag 0x11 bit 0)"]),
47:("Victini: slot 1 ability Super Luck, slots 2-6 of the record type.",["slot 1 ability Super Luck","slots 2-6 record type"]),
48:("Mewtwo: Mew done, Mew in slot 1, slots 2-6 of the record type.",["Mew done (0x11e8/0x11e9)","slot 1 Mew","slots 2-6 record type"]),
49:("Diancie: Carbink in slot 1; all 6 hold different Gems.",["slot 1 Carbink","6 slots hold items 339-356 (Normal Gem..Fairy Gem), all different"]),
50:("Hoopa: exactly 6 Pokémon, Rayquaza done, all 6 (no eggs) know Thief.",["party count == 6 (0x809fba8)","Rayquaza done (0x1212/0x1213)","6 non-egg slots know Thief"]),
51:("Volcanion: slot 1 knows Scald, slots 2-6 Fire.",["slot 1 knows Scald","slots 2-6 Fire"]),
52:("Meltan: slot 1 ability Magnet Pull, slots 2-6 of the record type.",["slot 1 ability Magnet Pull","slots 2-6 record type"]),
53:("Marshadow: slot 1 knows a Fighting move and a Ghost move; all 6 Fighting or Ghost.",["slot 1 knows a Fighting move and a Ghost move","6 slots Fighting or Ghost"]),
54:("Magearna: slot 1 holds Heart Scale, all 6 of the record type.",["slot 1 holds Heart Scale","6 slots record type"]),
55:("Zeraora: all 6 of the record type, slot 1 ability Volt Absorb.",["6 slots record type","slot 1 ability Volt Absorb"]),
}
rules={str(k):{"summary_en":v[0],"conditions":v[1]} for k,v in RS.items()}
modes={
"0":{"summary_en":"always true","conditions":[]},
"1":{"summary_en":"Regirock, Regice, Registeel, Regieleki and Regidrago all caught or defeated","conditions":["flags 0x11fd|0x11fe, 0x1200|0x1201, 0x1203|0x1204, 0x12c9|0x12ca, 0x12cc|0x12cd"],"used_by":["Regigigas"]},
"3":{"summary_en":"Groudon and Kyogre caught or defeated","conditions":["0x120f|0x1210","0x120c|0x120d"],"used_by":["Rayquaza"]},
"4":{"summary_en":"Tornadus and Thundurus caught or defeated (unused by the table)","conditions":["records 41 and 42 done"],"used_by":[]},
"other":{"summary_en":"false (2 and 5+ return 0)","conditions":[]},
}

# ---- per-record player lines ----
def L(pt,en): return (pt,en)
def tp(t): return T(t)
SAME={'pt':'','en':''}
def lines(r):
    sp=r['sp']; n=spname(sp); t=T(r['type']) if r['type']!=0xFF else None; R_=r['rule']
    out=[]; conf='decoded'; notes=[]
    A=out.append
    if R_==0:
        if r['low']==1:
            A(L('Encontro da história: o que o faz aparecer está no roteiro do jogo, que o app ainda não leu.','Story encounter: what makes it appear is in the game script, which the app has not read yet.'))
            conf='partial'; notes.append('Rule 0 with record byte 0x1F low bits = 1: skipped by 0x82aaba0 (scripted encounter). Its done flags are synced from story flags by 0x82aabec. The script conditions themselves were not decoded.')
        elif r['low']==2:
            A(L('Nenhuma exigência de equipe.','No party requirement.'))
            conf='partial'; notes.append('Rule 0 with byte 0x1F low bits = 2 (only Arceus); the meaning of the value 2 was not found.')
        else:
            A(L('Nenhuma exigência de equipe.','No party requirement.'))
    elif R_==1:
        A(L('Equipe de 6 Pokémon fósseis (Omanyte, Kabuto, Aerodactyl, Lileep, Anorith, Cranidos, Shieldon, Tirtouga, Archen, Tyrunt, Amaura, Dracozolt, Arctozolt, Dracovish, Arctovish ou suas evoluções).','A party of 6 Fossil Pokémon (Omanyte, Kabuto, Aerodactyl, Lileep, Anorith, Cranidos, Shieldon, Tirtouga, Archen, Tyrunt, Amaura, Dracozolt, Arctozolt, Dracovish, Arctovish or their evolutions).'))
    elif R_==2:
        A(L('Wailord no 1º lugar e Relicanth no 6º.','Wailord in slot 1 and Relicanth in slot 6.'))
        A(L(f'Do 2º ao 5º lugar, Pokémon do tipo {t}.',f'Slots 2 to 5: {t}-type Pokémon.'))
    elif R_==3:
        A(L('Wailord no 1º lugar e Relicanth no 6º.','Wailord in slot 1 and Relicanth in slot 6.'))
        A(L('Do 2º ao 5º lugar, Regirock, Regice, Registeel, Regieleki ou Regidrago.','Slots 2 to 5: Regirock, Regice, Registeel, Regieleki or Regidrago.'))
        A(L('Ter capturado ou derrotado Regirock, Regice, Registeel, Regieleki e Regidrago.','Have caught or defeated Regirock, Regice, Registeel, Regieleki and Regidrago.'))
    elif R_==4:
        A(L(f'Equipe de 6 Pokémon do tipo {t}.',f'A party of 6 {t}-type Pokémon.'))
    elif R_==5:
        A(L('Equipe de 6 Pokémon artificiais: Porygon, Porygon2, Porygon-Z, Mewtwo, Baltoy, Claydol, Castform, Golett, Golurk, Genesect, Type: Null, Silvally ou Magearna.','A party of 6 artificial Pokémon: Porygon, Porygon2, Porygon-Z, Mewtwo, Baltoy, Claydol, Castform, Golett, Golurk, Genesect, Type: Null, Silvally or Magearna.'))
    elif R_==6:
        A(L('Estar no passado.','Be in the past.'))
        A(L('Celebi no 1º lugar.','Celebi in slot 1.'))
        A(L('Do 2º ao 6º lugar, Paradoxos do passado: Great Tusk, Scream Tail, Brute Bonnet, Flutter Mane, Slither Wing, Sandy Shocks, Roaring Moon, Koraidon, Walking Wake, Gouging Fire ou Raging Bolt.','Slots 2 to 6: past Paradox Pokémon: Great Tusk, Scream Tail, Brute Bonnet, Flutter Mane, Slither Wing, Sandy Shocks, Roaring Moon, Koraidon, Walking Wake, Gouging Fire or Raging Bolt.'))
    elif R_==7:
        A(L('Estar no futuro.','Be in the future.'))
        A(L('Celebi no 1º lugar.','Celebi in slot 1.'))
        A(L('Do 2º ao 6º lugar, Paradoxos do futuro: Iron Treads, Iron Bundle, Iron Hands, Iron Jugulis, Iron Moth, Iron Thorns, Iron Valiant, Miraidon, Iron Leaves, Iron Boulder ou Iron Crown.','Slots 2 to 6: future Paradox Pokémon: Iron Treads, Iron Bundle, Iron Hands, Iron Jugulis, Iron Moth, Iron Thorns, Iron Valiant, Miraidon, Iron Leaves, Iron Boulder or Iron Crown.'))
    elif R_==8:
        A(L('Ter concluído a história do Celebi.','Have finished the Celebi story.'))
        A(L('Celebi no 1º lugar.','Celebi in slot 1.'))
        A(L('Do 2º ao 6º lugar, Pokémon do tipo Grass.','Slots 2 to 6: Grass-type Pokémon.'))
        notes.append('"Celebi story finished" = var 0x5009 > 9, the same test 0x82aabec uses to mark Celebi as defeated.')
    elif R_==9:
        A(L('Equipe de 6 Pokémon que sabem Transform.','A party of 6 Pokémon that know Transform.'))
    elif R_==10:
        ab={'Tapu Koko':'Electric Surge','Tapu Lele':'Psychic Surge','Tapu Bulu':'Grassy Surge','Tapu Fini':'Misty Surge'}[n]
        A(L(f'No 1º lugar, um Pokémon com a habilidade {ab}.',f'Slot 1: a Pokémon with the ability {ab}.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
        notes.append('The type of slot 1 is not checked.')
    elif R_==11:
        c={'Uxie':('Smart','Inteligência'),'Mesprit':('Cute','Fofura'),'Azelf':('Tough','Resistência')}[n]
        A(L('Equipe de 6 Pokémon do tipo Psychic.','A party of 6 Psychic-type Pokémon.'))
        A(L(f'Os 4 golpes do 1º lugar são da categoria de concurso {c[0]} ({c[1]}).',f'All 4 moves of slot 1 belong to the {c[0]} contest category.'))
    elif R_==12:
        A(L('Ter capturado ou derrotado Uxie, Mesprit e Azelf.','Have caught or defeated Uxie, Mesprit and Azelf.'))
        A(L('Uxie no 1º lugar, Mesprit no 2º e Azelf no 3º.','Uxie in slot 1, Mesprit in slot 2 and Azelf in slot 3.'))
        A(L(f'Do 4º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 4 to 6: {t}-type Pokémon.'))
        A(L('Os 6 sabem Trick Room.','All 6 know Trick Room.'))
    elif R_==13:
        b={975:'Articuno',976:'Zapdos',977:'Moltres'}[sp]
        A(L(f'Ter capturado ou derrotado o {b} comum.',f'Have caught or defeated the regular {b}.'))
        A(L(f'{b} comum no 1º lugar.',f'Regular {b} in slot 1.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==14:
        it={'Wo-Chien':'Miracle Seed','Chien-Pao':'Never-Melt Ice','Ting-Lu':'Soft Sand','Chi-Yu':'Charcoal'}[n]
        A(L('Equipe de 6 Pokémon do tipo Dark.','A party of 6 Dark-type Pokémon.'))
        A(L(f'No 1º lugar, um Pokémon também do tipo {t} segurando {it}.',f'Slot 1: a Pokémon that is also {t}-type, holding {it}.'))
    elif R_==15:
        mv={'Zacian':'Sacred Sword','Zamazenta':"King's Shield"}[n]
        A(L(f'No 1º lugar, um Pokémon que sabe {mv}.',f'Slot 1: a Pokémon that knows {mv}.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==16:
        c=('White','branca') if n=='Reshiram' else ('Black','preta')
        A(L('Jogar com o personagem nº 30 da lista de personagens (pelo guia da comunidade, o N).','Play as character no. 30 of the character list (N, according to the community guide).'))
        A(L(f'Equipe de 6 Pokémon de cor {c[0]} na Pokédex ({c[1]}).',f'A party of 6 Pokémon whose Pokédex color is {c[0]}.'))
        conf='partial'; notes.append('The ROM checks avatar id 30 (SaveBlock2 byte 8). That id 30 is N comes from the guide, not from the ROM.')
    elif R_==17:
        A(L('Equipe de 6 Pokémon, cada um do tipo Grass, Water, Fire ou Rock, com pelo menos um de cada desses 4 tipos.','A party of 6 Pokémon, each Grass, Water, Fire or Rock type, with at least one of each of these 4 types.'))
    elif R_==18:
        m={'Okidogi':'Cornerstone Mask','Munkidori':'Wellspring Mask','Fezandipiti':'Hearthflame Mask'}[n]
        A(L('Ter capturado ou derrotado Ogerpon.','Have caught or defeated Ogerpon.'))
        A(L(f'Ogerpon no 1º lugar segurando {m}.',f'Ogerpon in slot 1 holding {m}.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==19:
        A(L('Ter capturado ou derrotado Ogerpon, Okidogi, Munkidori e Fezandipiti.','Have caught or defeated Ogerpon, Okidogi, Munkidori and Fezandipiti.'))
        A(L('Ogerpon no 1º lugar segurando Pecha Berry.','Ogerpon in slot 1 holding a Pecha Berry.'))
        A(L('Okidogi no 2º lugar, Munkidori no 3º e Fezandipiti no 4º.','Okidogi in slot 2, Munkidori in slot 3 and Fezandipiti in slot 4.'))
        A(L('No 5º e 6º lugar, Pokémon do tipo Poison.','Slots 5 and 6: Poison-type Pokémon.'))
    elif R_==20:
        if n in ('Tornadus','Thundurus'):
            A(L(f'Equipe de 6 Pokémon do tipo {t}.',f'A party of 6 {t}-type Pokémon.'))
            A(L(f'Cada um sabe um golpe do tipo {t}.',f'Each one knows a {t}-type move.'))
        elif n=='Landorus':
            A(L('Tornadus no 1º lugar e Thundurus no 2º.','Tornadus in slot 1 and Thundurus in slot 2.'))
            A(L('Do 3º ao 6º lugar, Pokémon do tipo Ground.','Slots 3 to 6: Ground-type Pokémon.'))
        else:
            A(L('Ter capturado ou derrotado Tornadus, Thundurus e Landorus.','Have caught or defeated Tornadus, Thundurus and Landorus.'))
            A(L('Tornadus no 1º lugar, Thundurus no 2º e Landorus no 3º.','Tornadus in slot 1, Thundurus in slot 2 and Landorus in slot 3.'))
            A(L('Do 4º ao 6º lugar, Pokémon fêmeas do tipo Fairy.','Slots 4 to 6: female Fairy-type Pokémon.'))
    elif R_==21:
        if n=='Latias':
            A(L('Jogar com uma personagem feminina (provável).','Play as a female character (probable).'))
            A(L('No 1º lugar, um Pokémon segurando Red Flute.','Slot 1: a Pokémon holding a Red Flute.'))
            A(L('Equipe de 6 Pokémon fêmeas.','A party of 6 female Pokémon.'))
        else:
            A(L('Jogar com um personagem masculino (provável).','Play as a male character (probable).'))
            A(L('No 1º lugar, um Pokémon segurando Blue Flute.','Slot 1: a Pokémon holding a Blue Flute.'))
            A(L('Equipe de 6 Pokémon machos.','A party of 6 male Pokémon.'))
        conf='partial'; notes.append('The avatar test is membership in the set returned by 0x81baa88 (avatars 0,2,3,4,9,10,13-18,20-22,28,30,32,34-39,41,43,45,46,48,50,52,54-56,61-63,67,69,70,73-77,83,85,87,89,90,97,99,100,105,108,109,113). Latios needs an avatar in the set, Latias one outside it. That the set means "male avatar" is inferred from the Latios/Latias pairing and from avatar 30 (N) being in it; the avatar list itself was not read.')
    elif R_==22:
        A(L('Lunatone e Solrock no 1º e 2º lugar (em qualquer ordem).','Lunatone and Solrock in slots 1 and 2 (either order).'))
        A(L('Do 3º ao 6º lugar, Pokémon do tipo Psychic.','Slots 3 to 6: Psychic-type Pokémon.'))
    elif R_==23:
        A(L('Equipe de 6 Pokémon diferentes do tipo Poison.','A party of 6 different Poison-type Pokémon.'))
        notes.append('"Different" compares base forms (0x80a4f68 folds forms to their species id): Pikachu and Raichu are different, Raichu and Alolan Raichu are not.')
    elif R_==24:
        A(L('Ter capturado ou derrotado Cosmog.','Have caught or defeated Cosmog.'))
        A(L('Cosmog, Cosmoem, Solgaleo ou Lunala no 1º lugar.','Cosmog, Cosmoem, Solgaleo or Lunala in slot 1.'))
        X={'Nihilego':('Do 2º ao 6º lugar, Tentacool, Tentacruel, Frillish ou Jellicent.','Slots 2 to 6: Tentacool, Tentacruel, Frillish or Jellicent.'),
           'Buzzwole':('Do 2º ao 6º lugar, Pokémon machos do tipo Bug.','Slots 2 to 6: male Bug-type Pokémon.'),
           'Pheromosa':('Do 2º ao 6º lugar, Pokémon fêmeas do tipo Bug.','Slots 2 to 6: female Bug-type Pokémon.'),
           'Xurkitree':('Do 2º ao 6º lugar, Pokémon do tipo Electric que sabem Charge.','Slots 2 to 6: Electric-type Pokémon that know Charge.'),
           'Celesteela':('Do 2º ao 6º lugar, Pokémon que sabem Fly.','Slots 2 to 6: Pokémon that know Fly.'),
           'Kartana':('Do 2º ao 6º lugar, Pokémon que sabem um golpe cortante (Cut, Slash, Leaf Blade, Night Slash, X-Scissor, Psycho Cut, Sacred Sword, Aqua Cutter e outros).','Slots 2 to 6: Pokémon that know a slicing move (Cut, Slash, Leaf Blade, Night Slash, X-Scissor, Psycho Cut, Sacred Sword, Aqua Cutter and others).'),
           'Guzzlord':('Do 2º ao 6º lugar, Pokémon com a habilidade Gluttony.','Slots 2 to 6: Pokémon with the ability Gluttony.'),
           'Stakataka':('Do 2º ao 6º lugar, 5 Pokémon da mesma espécie, do tipo Rock ou Steel.','Slots 2 to 6: 5 Pokémon of the same species, Rock or Steel type.'),
           'Blacephalon':('Do 2º ao 6º lugar, Pokémon que sabem Self-Destruct, Explosion ou Misty Explosion.','Slots 2 to 6: Pokémon that know Self-Destruct, Explosion or Misty Explosion.')}[n]
        A(X)
        if n=='Kartana': notes.append('Slicing = move info byte 0x11 bit 2; 30 moves: Cut, Razor Leaf, Slash, Fury Cutter, Crush Claw, Air Cutter, Aerial Ace, Dragon Claw, Leaf Blade, Night Slash, Air Slash, X-Scissor, Shadow Claw, Psycho Cut, Cross Poison, Sacred Sword, Razor Shell, Secret Sword, Solar Blade, Behemoth Blade, Dire Claw, Stone Axe, Ceaseless Edge, Population Bomb, Kowtow Cleave, Bitter Blade, Aqua Cutter, Psyblade, Mighty Cleave, Tachyon Cutter.')
    elif R_==25:
        A(L('Ter capturado ou derrotado Cosmog, Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Poipole, Stakataka e Blacephalon.','Have caught or defeated Cosmog, Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Poipole, Stakataka and Blacephalon.'))
        A(L('Solgaleo ou Lunala no nível 100 no 1º lugar.','Solgaleo or Lunala at level 100 in slot 1.'))
        A(L('Do 2º ao 6º lugar, 5 Ultra Beasts diferentes (Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Naganadel, Stakataka, Blacephalon).','Slots 2 to 6: 5 different Ultra Beasts (Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord, Naganadel, Stakataka, Blacephalon).'))
        notes.append('Poipole itself is not accepted in slots 2-6; Naganadel is.')
    elif R_==26:
        if n=='Groudon':
            A(L('Ter a Red Orb (na mochila ou segurada por um Pokémon da equipe).','Have the Red Orb (in the bag or held by a party Pokémon).'))
        elif n=='Kyogre':
            A(L('Ter a Blue Orb (na mochila ou segurada por um Pokémon da equipe).','Have the Blue Orb (in the bag or held by a party Pokémon).'))
            A(L('Se o Groudon já está liberado e você tem a Red Orb, capturar ou derrotar o Groudon antes.','If Groudon is already unlocked and you have the Red Orb, catch or defeat Groudon first.'))
            notes.append('Exact test: Groudon done OR flag 0x1311 (Groudon record story flag) unset OR no Red Orb.')
        else:
            A(L('Ter capturado ou derrotado Groudon e Kyogre.','Have caught or defeated Groudon and Kyogre.'))
            A(L('Groudon no 1º lugar e Kyogre no 2º.','Groudon in slot 1 and Kyogre in slot 2.'))
            A(L('Do 3º ao 6º lugar, Pokémon do tipo Dragon.','Slots 3 to 6: Dragon-type Pokémon.'))
    elif R_==27:
        A(L('Equipe de 6 Pokémon que sabem Wish.','A party of 6 Pokémon that know Wish.'))
    elif R_==28:
        A(L('Equipe de 6 Pokémon do tipo Water.','A party of 6 Water-type Pokémon.'))
        A(L('Um Ovo de um Pokémon do tipo Water guardado numa caixa especial do jogo (qual caixa não foi identificada).','A Water-type Egg kept in a special storage box of the game (which box was not identified).'))
        conf='partial'; notes.append('The second test scans the 30 entries of storage box id 0xF0 (240) at [0x30055cc]+0x29f, 15-byte entries (species 11 bits, byte 2 bit 1 = egg; confirmed via SetBoxMonData field 0x2d at 0x8135c94), looking for an egg whose species is Water. What this box is in the game (it is not one of the 37 normal PC boxes) was not established.')
    elif R_==29:
        if n in ('Raikou','Entei','Suicune'):
            e={'Raikou':'Jolteon','Entei':'Flareon','Suicune':'Vaporeon'}[n]
            A(L('Não estar no passado.','Not be in the past.'))
            A(L(f'{e} no 1º lugar.',f'{e} in slot 1.'))
            A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
        else:
            A(L('Estar no passado.','Be in the past.'))
            A(L('Ter capturado ou derrotado Koraidon.','Have caught or defeated Koraidon.'))
            A(L('Celebi no 1º lugar.','Celebi in slot 1.'))
            A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==30:
        A(L('No 1º lugar, um Pokémon com a habilidade Justified.','Slot 1: a Pokémon with the ability Justified.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==31:
        A(L('Ter capturado ou derrotado Cobalion, Terrakion e Virizion.','Have caught or defeated Cobalion, Terrakion and Virizion.'))
        A(L('Cobalion no 1º lugar, Terrakion no 2º e Virizion no 3º, os três sabendo Sacred Sword.','Cobalion in slot 1, Terrakion in slot 2 and Virizion in slot 3, all three knowing Sacred Sword.'))
        A(L('Do 4º ao 6º lugar, Pokémon do tipo Water.','Slots 4 to 6: Water-type Pokémon.'))
    elif R_==32:
        A(L('Estar no futuro.','Be in the future.'))
        A(L('Ter capturado ou derrotado Miraidon.','Have caught or defeated Miraidon.'))
        A(L('Celebi no 1º lugar.','Celebi in slot 1.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==33:
        A(L('Ter capturado ou derrotado Dialga e Palkia.','Have caught or defeated Dialga and Palkia.'))
        A(L('Dialga e Palkia no 1º e 2º lugar (em qualquer ordem).','Dialga and Palkia in slots 1 and 2 (either order).'))
        A(L('Do 3º ao 6º lugar, Pokémon do tipo Ghost.','Slots 3 to 6: Ghost-type Pokémon.'))
    elif R_==34:
        A(L('Do 1º ao 3º lugar, Pokémon do tipo Fire.','Slots 1 to 3: Fire-type Pokémon.'))
        A(L('Do 4º ao 6º lugar, Pokémon do tipo Steel.','Slots 4 to 6: Steel-type Pokémon.'))
    elif R_==35:
        A(L('Equipe de 6 Pokémon que sabem Moonlight.','A party of 6 Pokémon that know Moonlight.'))
    elif R_==36:
        A(L('Depende de um evento da história que o app ainda não identificou; a equipe não é conferida.','Depends on a story event the app has not identified yet; the party is not checked.'))
        conf='partial'; notes.append('Only flag 0x1425 is tested. What sets it was not identified (it is not one of the Cresselia record flags 0x1232-0x1234).')
    elif R_==37:
        A(L('Equipe de 6 Pokémon diferentes do tipo Grass.','A party of 6 different Grass-type Pokémon.'))
        A(L('O 1º lugar sabe Sweet Scent.','Slot 1 knows Sweet Scent.'))
    elif R_==38:
        A(L('Ter capturado ou derrotado Reshiram e Zekrom.','Have caught or defeated Reshiram and Zekrom.'))
        A(L('Reshiram e Zekrom no 1º e 2º lugar (em qualquer ordem).','Reshiram and Zekrom in slots 1 and 2 (either order).'))
        A(L('Do 3º ao 6º lugar, Pokémon do tipo Ice.','Slots 3 to 6: Ice-type Pokémon.'))
    elif R_==39:
        if n=='Xerneas':
            A(L('Unown X no 1º lugar.','Unown X in slot 1.')); A(L('Do 2º ao 6º lugar, Pokémon do tipo Fairy.','Slots 2 to 6: Fairy-type Pokémon.'))
        elif n=='Yveltal':
            A(L('Unown Y no 1º lugar.','Unown Y in slot 1.')); A(L('Do 2º ao 6º lugar, Pokémon do tipo Dark.','Slots 2 to 6: Dark-type Pokémon.'))
        else:
            A(L('Ter capturado ou derrotado Xerneas e Yveltal.','Have caught or defeated Xerneas and Yveltal.'))
            A(L('Unown Z no 1º lugar.','Unown Z in slot 1.')); A(L('Do 2º ao 6º lugar, Pokémon do tipo Ground ou Dragon.','Slots 2 to 6: Ground- or Dragon-type Pokémon.'))
        notes.append('Slot 1 is compared to species ids 1023/1024/1025 exactly. The Unown forms are ids 1001-1027 (27 forms), so in the expansion order B..Z, !, ? these are X, Y, Z; the guide says the same.')
    elif R_==40:
        A(L('Ter capturado ou derrotado Zacian e Zamazenta.','Have caught or defeated Zacian and Zamazenta.'))
        A(L('Zacian e Zamazenta no 1º e 2º lugar (em qualquer ordem).','Zacian and Zamazenta in slots 1 and 2 (either order).'))
        A(L('Do 3º ao 6º lugar, 4 Pokémon diferentes que podem dar Gigantamax e têm o Gigantamax Factor (ou já em forma Gigantamax).','Slots 3 to 6: 4 different Pokémon that can Gigantamax and have the Gigantamax Factor (or are a Gigantamax form).'))
    elif R_==41:
        A(L('Equipe de 6 Pokémon diferentes do tipo Fighting.','A party of 6 different Fighting-type Pokémon.'))
    elif R_==42:
        A(L('Equipe de 6 Pokémon diferentes do tipo Ice.','A party of 6 different Ice-type Pokémon.'))
        A(L('O 1º lugar tem Attack maior que Sp. Atk e sabe um golpe físico do tipo Ice.','Slot 1 has higher Attack than Sp. Atk and knows a physical Ice-type move.'))
    elif R_==43:
        A(L('Equipe de 6 Pokémon diferentes do tipo Ghost.','A party of 6 different Ghost-type Pokémon.'))
        A(L('O 1º lugar tem Sp. Atk maior que Attack e sabe um golpe especial do tipo Ghost.','Slot 1 has higher Sp. Atk than Attack and knows a special Ghost-type move.'))
    elif R_==44:
        A(L('Ter capturado ou derrotado Glastrier e Spectrier.','Have caught or defeated Glastrier and Spectrier.'))
        A(L('Glastrier e Spectrier no 1º e 2º lugar (em qualquer ordem).','Glastrier and Spectrier in slots 1 and 2 (either order).'))
        A(L('Do 3º ao 6º lugar, Pokémon do tipo Grass ou Psychic.','Slots 3 to 6: Grass- or Psychic-type Pokémon.'))
        A(L('Os 6 seguram Berries diferentes.','All 6 hold different Berries.'))
    elif R_==45:
        A(L('Equipe de 6 Pokémon.','A party of 6 Pokémon.'))
        A(L('O 1º lugar tem o Tera Type Stellar.','Slot 1 has the Stellar Tera Type.'))
        A(L('Do 2º ao 6º lugar, 5 Tera Types diferentes, nenhum Stellar.','Slots 2 to 6: 5 different Tera Types, none Stellar.'))
    elif R_==46:
        A(L('Equipe de 6 Pokémon que sabem um golpe de dança (Swords Dance, Petal Dance, Feather Dance, Teeter Dance, Dragon Dance, Lunar Dance, Quiver Dance, Fiery Dance, Revelation Dance, Clangorous Soul, Victory Dance ou Aqua Step).','A party of 6 Pokémon that know a dance move (Swords Dance, Petal Dance, Feather Dance, Teeter Dance, Dragon Dance, Lunar Dance, Quiver Dance, Fiery Dance, Revelation Dance, Clangorous Soul, Victory Dance or Aqua Step).'))
    elif R_==47:
        A(L('No 1º lugar, um Pokémon com a habilidade Super Luck.','Slot 1: a Pokémon with the ability Super Luck.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==48:
        A(L('Ter capturado ou derrotado Mew.','Have caught or defeated Mew.'))
        A(L('Mew no 1º lugar.','Mew in slot 1.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==49:
        A(L('Carbink no 1º lugar.','Carbink in slot 1.'))
        A(L('Os 6 seguram Gems diferentes (Normal Gem a Fairy Gem).','All 6 hold different Gems (Normal Gem to Fairy Gem).'))
    elif R_==50:
        A(L('Ter capturado ou derrotado Rayquaza.','Have caught or defeated Rayquaza.'))
        A(L('Equipe de exatamente 6 Pokémon (sem ovos), todos sabendo Thief.','A party of exactly 6 Pokémon (no Eggs), all knowing Thief.'))
        A(L('Um Pokémon da equipe usa Teleport (pelo menu da equipe) de frente para o lugar do Hoopa no mapa.','A party Pokémon uses Teleport (from the party menu) while facing the Hoopa spot on the map.'))
        notes.append('Trigger 0x82aaadc is called by the Teleport field-move setup 0x8201084 (entry 8 of the field-move function table 0x92bd0e4; field-move list 0x92bd0c2 = Cut, Flash, Rock Smash, Strength, Surf, Fly, Dive, Waterfall, Teleport, ...) and again by its callbacks 0x82010ec/0x82011a4. When not in the past (flag 0x1318) it finds the rule-50 record, checks the player is on its map (0x82a73f0), the record is not done (0x82a7434) and the requirements hold (0x82aa894), then compares the tile in front of the player (0x80cc594 = coords one step in front of the player) with the coords of the object of local id +2 (0x80cf980; 0x2038d10 + id*0x24 + 0x10/0x12) and runs script 0x8403c90. The record item Prison Bottle is required by the main check (bag only, 0x8146c14) except with the VISIVEIS option.')
    elif R_==51:
        A(L('No 1º lugar, um Pokémon que sabe Scald.','Slot 1: a Pokémon that knows Scald.'))
        A(L('Do 2º ao 6º lugar, Pokémon do tipo Fire.','Slots 2 to 6: Fire-type Pokémon.'))
    elif R_==52:
        A(L('No 1º lugar, um Pokémon com a habilidade Magnet Pull.','Slot 1: a Pokémon with the ability Magnet Pull.'))
        A(L(f'Do 2º ao 6º lugar, Pokémon do tipo {t}.',f'Slots 2 to 6: {t}-type Pokémon.'))
    elif R_==53:
        A(L('Equipe de 6 Pokémon do tipo Fighting ou Ghost.','A party of 6 Fighting- or Ghost-type Pokémon.'))
        A(L('O 1º lugar sabe um golpe do tipo Fighting e um do tipo Ghost.','Slot 1 knows a Fighting-type move and a Ghost-type move.'))
    elif R_==54:
        A(L(f'Equipe de 6 Pokémon do tipo {t}.',f'A party of 6 {t}-type Pokémon.'))
        A(L('O 1º lugar segura Heart Scale.','Slot 1 holds a Heart Scale.'))
    elif R_==55:
        A(L(f'Equipe de 6 Pokémon do tipo {t}.',f'A party of 6 {t}-type Pokémon.'))
        A(L('O 1º lugar tem a habilidade Volt Absorb.','Slot 1 has the ability Volt Absorb.'))
    else:
        raise SystemExit(f'rule {R_}')
    if r['mode'] not in (0,) and R_ not in (3,26):
        raise SystemExit('unexpected mode')
    # common: generic party-type test
    if t and R_ not in NOTYPE:
        notes.append(f'The main check also requires at least one {t}-type party member (0x82a75f0); the rule already implies it.' if R_ in (13,22,23,47,48) else f'The main check also requires at least one {t}-type party member (0x82a75f0).')
    if r['flag']: notes.append(f'Record story flag 0x{r["flag"]:x} must be set; its meaning was not identified.')
    if r['var']: notes.append(f'Record var 0x{r["var"]:x} must be >= {r["vmin"]}; its meaning was not identified.')
    return out,conf,notes

def visible(r):
    """Requirements with the LENDARIOS = VISIVEIS option (bit 0x10 of SB2+0x2F4): AltRule 0x82aa514."""
    n=spname(r['sp']); R_=r['rule']; o=[]
    A=o.append
    if R_==6: A(L('Estar no passado.','Be in the past.'))
    elif R_==7: A(L('Estar no futuro.','Be in the future.'))
    elif R_==8: A(L('Ter concluído a história do Celebi.','Have finished the Celebi story.'))
    elif R_==12: A(L('Ter capturado ou derrotado Uxie, Mesprit e Azelf.','Have caught or defeated Uxie, Mesprit and Azelf.'))
    elif R_==13: A(L(f'Ter capturado ou derrotado o {n.split("-")[0]} comum.',f'Have caught or defeated the regular {n.split("-")[0]}.'))
    elif R_==18: A(L('Ter capturado ou derrotado Ogerpon.','Have caught or defeated Ogerpon.'))
    elif R_==19: A(L('Ter capturado ou derrotado Ogerpon, Okidogi, Munkidori e Fezandipiti.','Have caught or defeated Ogerpon, Okidogi, Munkidori and Fezandipiti.'))
    elif R_==20:
        if n.startswith('Enamorus'): A(L('Ter capturado ou derrotado Tornadus, Thundurus e Landorus.','Have caught or defeated Tornadus, Thundurus and Landorus.'))
        else: A(L('Ter vencido a Liga de Johto.','Have beaten the Johto League.'))
    elif R_==24: A(L('Ter capturado ou derrotado Cosmog.','Have caught or defeated Cosmog.'))
    elif R_==25: A(L('Ter capturado ou derrotado Cosmog e todas as Ultra Beasts.','Have caught or defeated Cosmog and all the Ultra Beasts.'))
    elif R_==26:
        if n=='Kyogre': A(L('Se o Groudon já está liberado, capturar ou derrotar o Groudon antes.','If Groudon is unlocked, catch or defeat Groudon first.'))
        elif n=='Rayquaza': A(L('Ter capturado ou derrotado Groudon e Kyogre.','Have caught or defeated Groudon and Kyogre.'))
        else: A(L('Nenhuma exigência além das da tabela.','Nothing beyond the table fields.'))
    elif R_==29:
        if n in ('Raikou','Entei','Suicune'): A(L('Não estar no passado.','Not be in the past.'))
        else: A(L('Estar no passado e ter capturado ou derrotado Koraidon.','Be in the past and have caught or defeated Koraidon.'))
    elif R_==31: A(L('Ter capturado ou derrotado Cobalion, Terrakion e Virizion.','Have caught or defeated Cobalion, Terrakion and Virizion.'))
    elif R_==32: A(L('Estar no futuro e ter capturado ou derrotado Miraidon.','Be in the future and have caught or defeated Miraidon.'))
    elif R_==33: A(L('Ter capturado ou derrotado Dialga e Palkia.','Have caught or defeated Dialga and Palkia.'))
    elif R_==36: A(L('Depende de um evento da história que o app ainda não identificou.','Depends on a story event the app has not identified yet.'))
    elif R_==38: A(L('Ter capturado ou derrotado Reshiram e Zekrom.','Have caught or defeated Reshiram and Zekrom.'))
    elif R_==39:
        if n=='Zygarde': A(L('Ter capturado ou derrotado Xerneas e Yveltal.','Have caught or defeated Xerneas and Yveltal.'))
        else: A(L('Nenhuma exigência além das da tabela.','Nothing beyond the table fields.'))
    elif R_==40: A(L('Ter capturado ou derrotado Zacian e Zamazenta.','Have caught or defeated Zacian and Zamazenta.'))
    elif R_==43: A(L('Ter vencido a Liga de Johto.','Have beaten the Johto League.'))
    elif R_==44: A(L('Ter capturado ou derrotado Glastrier e Spectrier.','Have caught or defeated Glastrier and Spectrier.'))
    elif R_==48: A(L('Ter capturado ou derrotado Mew.','Have caught or defeated Mew.'))
    elif R_==50:
        A(L('Ter capturado ou derrotado Rayquaza.','Have caught or defeated Rayquaza.'))
        A(L('Um Pokémon da equipe usa Teleport (pelo menu da equipe) de frente para o lugar do Hoopa no mapa.','A party Pokémon uses Teleport (from the party menu) while facing the Hoopa spot on the map.'))
    elif R_==0: A(L('Nenhuma exigência além das da tabela.','Nothing beyond the table fields.'))
    else:
        if r['badges'] or r['league'] or r['flag'] or r['var'] or r['mode']:
            A(L('Nenhuma exigência além das da tabela.','Nothing beyond the table fields.'))
        else:
            A(L('Ter vencido a Liga de Johto.','Have beaten the Johto League.'))
    if r['mode']==1: A(L('Ter capturado ou derrotado Regirock, Regice, Registeel, Regieleki e Regidrago.','Have caught or defeated Regirock, Regice, Registeel, Regieleki and Regidrago.'))
    if r['mode']==3 and R_!=26: A(L('Ter capturado ou derrotado Groudon e Kyogre.','Have caught or defeated Groudon and Kyogre.'))
    return o

records=[]
for i,r in enumerate(recs):
    ln,conf,notes=lines(r)
    vis=visible(r)
    records.append(dict(index=i,species=r['sp'],speciesName=spname(r['sp']),map=[r['g'],r['m']],objectLocalId=r['obj'],level=r['lv'],
        badges=r['badges'],league=bool(r['league']),flag=(f'0x{r["flag"]:x}' if r['flag'] else None),
        var=([f'0x{r["var"]:x}',r['vmin']] if r['var'] else None),
        item=(itemname(r['item']) if r['item'] else None),partySpecies=(spname(r['psp']) if r['psp'] else None),
        type=(T(r['type']) if r['type']!=0xFF else None),mode=r['mode'],rule=r['rule'],ruleLowBits=r['low'],
        doneFlags={'object':f'0x{r["fhide"]:x}','defeated':f'0x{r["fdef"]:x}','caught':f'0x{r["fcau"]:x}'},
        requirements_pt=[a for a,b in ln],requirements_en=[b for a,b in ln],
        requirements_visible_pt=[a for a,b in vis],requirements_visible_en=[b for a,b in vis],
        confidence=conf,notes=' '.join(notes) or None))
doc=dict(meta=dict(rom='PokemonQuetzalPtBrAlpha9v1.gba',table='0x09992D6C (file 0x1992D6C), 106 x 32 bytes',
  check='0x082AA894',
  order_en='Main check, in order: region/time check (0x82aa4f0, plus past-only species when flag 0x1318); badges of the current region >= badges; League of the current region if league; story flag; var >= min; then if SaveBlock2+0x2F4 & 0x10 (option LENDARIOS = VISIVEIS): mode + AltRule only (requirements_visible_*); otherwise item in bag, party species (unused), mode, at least one party member of the record type (rules not in the exclusion list), then the rule function.',
  slots='Slots are 1-based. "of type X" = type 1 or type 2 is X (GetSpeciesType 0x80a5ddc, which honours the randomized-types option). Species tests use the base form (0x80a4f68) unless noted "exact". Empty slots and Eggs fail per-slot tests.'),
  rules=rules,modes=modes,records=records)
# Para o app: só as linhas por espécie (o resto, como flags e notas, fica neste script)
app={str(r['species']):dict(pt=r['requirements_pt'],en=r['requirements_en'],vpt=[x for x in r['requirements_visible_pt'] if not x.startswith('Nenhuma exigência')],ven=[x for x in r['requirements_visible_en'] if not x.startswith('Nothing beyond')],**({'partial':1} if r['confidence']!='decoded' else {})) for r in records}
assert len(app)==len(records), 'espécie repetida na tabela'
# Hoenn e Kanto (com as Ilhas Sete): as linhas decodificadas ficam em tools/quetzal-legend-rules-hk.json (ver o meta de
# lá). Aqui só se confere que a ROM é a mesma em que elas foram lidas (CRC dos primeiros 64 bytes de cada função de
# Hoenn, da tabela de Kanto e da função que a confere; espécie de cada registro de Kanto); se não bater, nada é gravado.
import zlib
HK=json.load(open(ROOT+'tools/quetzal-legend-rules-hk.json'))
def crc(a,n=0x40): a&=0x1fffffe; return '%08x'%zlib.crc32(R[a:a+n])
ck=HK['meta']['checks']; KT=int(ck['kantoTable']['at'],16)
assert crc(KT,123*16)==ck['kantoTable']['crc'], 'tabela de Kanto diferente nesta ROM'
assert crc(int(ck['kantoRule']['fn'],16))==ck['kantoRule']['crc'], 'função de Kanto diferente nesta ROM'
legend={'johto':app}
for reg in ('hoenn','kanto'):
    legend[reg]={}
    for sp,e in HK[reg].items():
        if 'fn' in e: assert crc(int(e['fn'],16))==e['crc'], f'função {e["fn"]} ({spname(int(sp))}) diferente nesta ROM'
        if 'rec' in e: assert u16(KT+16*e['rec'])==int(sp), f'registro {e["rec"]} de Kanto não é {spname(int(sp))}'
        legend[reg][sp]={k:e[k] for k in ('pt','en','vpt','ven','partial') if k in e}
        legend[reg][sp].setdefault('vpt',[]); legend[reg][sp].setdefault('ven',[])
        if e.get('partial'): legend[reg][sp]['partial']=1
json.dump(dict(meta=dict(source='ROM do Quetzal (tools/quetzal-legend-rules.py e tools/quetzal-legend-rules-hk.json): Johto pela tabela de encontros únicos, Hoenn e Kanto pelas funções que conferem cada encontro; não conferido no jogo'),legend=legend),open(ROOT+'src/data/quetzal-legend-rules.json','w'),ensure_ascii=False,separators=(',',':'))
open(ROOT+'src/data/quetzal-legend-rules.json','a').write('\n')
print({r:(len(v),sum('partial' in x for x in v.values())) for r,v in legend.items()},'(total, em parte)');print(sum(r['confidence']=='decoded' for r in records),'decoded;',[ (r['index'],r['speciesName']) for r in records if r['confidence']!='decoded'])
