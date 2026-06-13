# Who Painted This? — Revue par le Collège d'Experts
### Un daily casual game a-t-il les bases pour devenir le prochain Wordle de l'art ?

*Revue collective · Mai 2026*

---

## Le jury

| Expert | Spécialité |
|---|---|
| **Jordan** | Game Designer — boucles de jeu, courbes de difficulté |
| **Sasha** | Experte en rétention & engagement — streaks, notifications, hooks |
| **Léa** | UX/UI — onboarding, friction, hiérarchie visuelle |
| **Marcus** | Growth & viralité — partage, nom de marque, acquisition |
| **Yuki** | Stratège contenu & SEO — éducation, communauté, indexation |
| **Tom** | Product Manager — priorisation, roadmap, quick wins |

---

## La note globale

| Dimension | Note | Verdict |
|---|---|---|
| Mécanique de jeu | 8/10 | ✦ Solide |
| Rétention | 4/10 | ✦ À refondre |
| Viralité & partage | 5/10 | ✦ Prometteur mais incomplet |
| UX / Onboarding | 6/10 | ✦ Propre, quelques angles morts |
| Contenu & éducation | 7/10 | ✦ Le vrai atout différenciant |
| Infrastructure & pipeline | 9/10 | ✦ Remarquable pour un side-project |

**Score global : 6,5/10 — Un très bon socle, une rétention insuffisante pour exploser.**

---

## JORDAN — Game Designer

### Ce qui marche vraiment bien

La mécanique principale est **brillante et sous-exploitée dans l'univers des daily games**. Le dézoom progressif sur un détail de tableau est l'une des rares mécaniques qui justifie un format quotidien visuellement : chaque mauvaise réponse fait littéralement évoluer ce que tu vois, ce n'est pas juste du scoring — c'est de la narration visuelle.

Le **dernier essai en QCM à 4 choix** est une excellente décision de design. C'est le "50/50" de Qui Veut Gagner des Millions — ça relance l'espoir au bon moment, ça empêche l'abandon frustré, et ça donne aux joueurs moins experts une chance de terminer dignement.

### Les problèmes de design

**1. Le dézoom est une illusion CSS, pas un vrai dézoom.**

Actuellement, `ZoomableImage` applique un `scale()` CSS sur l'image entière à partir d'un point d'ancrage fixe (`detailX: 50%, detailY: 30%`). En pratique : l'image entière est chargée dès le départ, et un observateur attentif en mode "inspect element" voit la réponse. Mais surtout — le choix du détail de départ est fixe pour toutes les œuvres. Un tableau avec un ciel vide au centre sera indéchiffrable au zoom maximum ; un portrait sera trivial. **Il n'y a aucune modélisation de la difficulté par œuvre.**

Recommandation : introduire dans le CSV un champ `detail_region` (ex. `"top-left"`, `"center-bottom"`) défini manuellement ou semi-automatiquement par un script qui analyse les zones à fort contraste. Cela prend 20 minutes de travail sur le pipeline — et la différence sur l'expérience est énorme.

**2. Le feedback entre les essais est trop abstrait.**

Wordle est addictif parce que son feedback (vert/jaune/gris) est *immédiatement actionnable*. Ici, "Try an older artist" ou "Similar fame" demandent une connaissance implicite de l'histoire de l'art que la plupart des joueurs n'ont pas. Le joueur lambda qui voit "Movement: Baroque — different" n'a probablement aucune idée de ce que ça implique comme noms d'artistes.

Recommandation : enrichir le feedback avec des **exemples concrets dans la même catégorie**. Exemple : "Movement: Baroque (different) — artistes Baroque connus : Rembrandt, Vermeer, Caravage". Un seul exemple suffit. C'est un hint jouable, pas une leçon.

**3. Le bouton "I give up" est un trou noir de rétention.**

Il est accessible dès le premier essai. Wordle n'a pas de capitulation. Duolingo non plus. La frustration gérée fait partie du plaisir d'un daily game : on revient le lendemain avec l'envie de se rattraper. "I give up" court-circuite ce sentiment. 

Recommandation : verrouiller la capitulation au minimum après **3 essais**. Ou mieux : renommer ce bouton "Montre-moi la réponse" et le placer *sous* le résultat du jeu (quand le jeu est terminé, l'artiste étant révélé de toute façon), en le retirant du flow actif.

**4. Le rythme du dézoom est trop rapide.**

Avec 5 essais et un facteur de zoom initial de 4,8×, la progression est assez brutale. À l'essai 2 ou 3, l'image est déjà très reconnaissable pour les tableaux célèbres. Pour un spécialiste, le jeu se termine souvent en 1-2 essais par reconnaissance culturelle basique, sans que la mécanique de dézoom ait vraiment joué son rôle de tension dramatique.

Recommandation : explorer un **mode "Sombre"** avec 7 essais et un zoom de départ plus agressif (6× ou 8×), réservé aux joueurs qui ont déjà complété 5 puzzles. Ça crée un objectif d'accès à débloquer et segmente l'audience expert.

---

## SASHA — Experte en rétention & engagement

### Le diagnostic sans détour

**Ce jeu n'a pas de système de rétention. Il a des statistiques.**

Les stats (streak, total plays, fastest solve) sont nécessaires mais pas suffisantes. Wordle a explosé parce qu'il créait un *rituel quotidien ancré dans des habitudes sociales*. Framed (films) ou Heardle (musique) ont capitalisé sur la même mécanique. Ce jeu a tous les ingrédients — il manque le déclencheur comportemental.

### Les 3 leviers de rétention à implémenter

**1. Notifications — le levier n°1, absent.**

Il n'y a aucun moyen de rappeler au joueur que le puzzle du jour est disponible. C'est la différence entre "j'y jouerai si j'y pense" et "c'est dans ma routine matinale". 

Action minimale : une **page d'inscription email simple** ("Rappel quotidien à 8h") avec une séquence d'un email par jour contenant une preview floutée du tableau du jour. Un service comme Resend ou Loops est à 0€ jusqu'à quelques milliers d'abonnés. L'email est le canal de rétention le plus puissant pour un daily game.

Action élargie : **Web Push Notifications** via la PWA. Next.js supporte nativement les service workers. Une bannière "Activer les rappels quotidiens" après la première partie résolue convertit bien.

**2. La streak est invisble — il faut la rendre viscérale.**

Actuellement la streak est un chiffre dans un tableau. Duolingo a construit son empire sur des flammes qui meurent si on ne joue pas. Le risque de *perdre* sa streak est beaucoup plus motivant que le gain de la construire.

Recommandation : afficher un **indicateur de streak "en danger"** si le joueur n'a pas joué ce jour-là. Une ligne type "🔥 7 jours — Pas encore joué aujourd'hui" visible dès l'arrivée sur la page. Associer ça à un email de rappel "Ta streak est en danger" envoyé à 20h si le puzzle du jour n'a pas été joué.

**3. L'archive est une mine d'or inexploitée.**

30 tableaux seulement sont accessibles en archive. Pour un joueur qui découvre le jeu aujourd'hui, il peut "rattraper" 30 parties d'un coup — ce qui est génial pour la rétention d'un nouveau joueur. Mais l'archive n'est pas positionnée comme un *objectif de complétion* : "30 tableaux à découvrir" sonne moins bien que "Peux-tu compléter les 30 tableaux de ce mois ?"

Recommandation : ajouter un **compteur de complétion mensuel** type "14/30 tableaux ce mois-ci" visible dans l'archive et sur la page d'accueil. Gamifier le retour sur l'archive.

---

## LÉA — UX / Onboarding

### Ce qui est très bien

Le design est **épuré et juste**. La mono-colonne, la typographie monospace, l'absence de publicités : c'est exactement le bon registre pour un public adulte cultivé. Wordle avait réussi pour les mêmes raisons — un web propre dans un internet surchargé.

L'aide contextuelle (modale "How it works") est bien conçue et se déclenche uniquement à la première visite. Pas intrusif.

### Les frictions cachées

**1. Le premier écran ne communique pas la proposition de valeur.**

Un nouveau visiteur voit : un titre "Who painted this?", une image floue, et une input. C'est fonctionnel, mais ça ne *donne pas envie*. Il manque **une ligne d'accroche visible** sous le titre — quelque chose comme "Un tableau par jour. Zoome, dézoome, deviens incollable." Les meilleurs daily games récompensent les 5 premières secondes de curiosité.

**2. La progression zoom → wide n'est pas assez *spectaculaire*.**

Le dézoom est graduel et discret, ce qui est élégant — mais dans un format où l'image EST le jeu, la révélation finale devrait être un moment de pur plaisir visuel. Actuellement, passer à l'image pleine après la dernière tentative est quasi-imperceptible (un changement de style CSS).

Recommandation : animer la révélation finale avec une **transition dramatique** — un dézoom rapide de 4× à 1× en 0,8s avec une légère impulsion ("spring") sur la photo. Framer Motion est déjà intégré dans le projet — c'est 10 lignes de code. Cet effet fait toujours "wow" et est la chose que les gens partagent sur les réseaux.

**3. Le feedback des tentatives est lisible mais pas satisfaisant.**

Les lignes de feedback (Birth year, Death year, Movement, Country, Fame hint, Era hint) représentent 6 items par tentative. C'est beaucoup. Un joueur avec 4 tentatives voit potentiellement 24 lignes de feedback empilées. La densité informationnelle dépasse la capacité de traitement.

Recommandation : **passer le feedback en format "carte compacte"** avec des icônes visuelles plutôt que du texte. Exemple : 🗓️ 1789 · 🌍 France · 🎨 Baroque · ✦ Similaire à l'artiste du jour. Un glyphe de couleur (vert/orange/rouge) sur chaque dimension suffit.

**4. Mobile : le input "Who painted this?" s'ouvre avec le clavier natif.**

Sur mobile, ouvrir le clavier décale toute la page et cache l'image — l'élément central du jeu. C'est un problème UX connu sur mobile. Les suggestions sont dans un dropdown sur `input`, ce qui se retrouve derrière le clavier.

Recommandation : sur mobile, déclencher les suggestions dans un **bottom sheet** (panneau qui glisse depuis le bas) plutôt qu'un dropdown. C'est le pattern attendu par les utilisateurs mobiles.

---

## MARCUS — Growth & Viralité

### Le nom est un problème.

"Who Painted This?" décrit parfaitement le jeu — et c'est justement le problème. Les meilleurs daily games ont des noms courts, mémorables, brandables : **Wordle, Framed, Heardle, Globle, Nerdle, Worldle**. Ils se partagent comme des mots-clés, pas comme des descriptions.

"Who Painted This?" est impossible à taguer proprement (`@whopaintedthis` est lisible mais long), difficile à taper dans une barre d'URL de mémoire, et ne crée pas de logo/identité visuelle forte.

Propositions de noms alternatifs à explorer :
- **Daub** — court, évocateur (une "daub" = coup de peinture en anglais), mémorable
- **Tableau** — français dans un contexte anglophone = exotisme chic, direct
- **Vermeer** — le nom d'un peintre comme symbole du genre (risque IP, mais puissant)
- **Pinxit** — latin pour "il a peint" (signature sur les tableaux anciens), court, unique
- **Varnish** — poétique, court, SEO vierge
- **Atelier** — cultuel, mémorable, évoque l'art

Un rebranding n'est pas obligatoire maintenant, mais si le jeu décolle, le nom sera une friction à chaque mention presse.

### Le share text pourrait travailler beaucoup plus dur

Le texte de partage actuel :
```
Who painted this? · One-minute art puzzle
Puzzle solved.
✅ × × × ×
Can you beat me?
https://signalbeat.studio/puzzle/2026-05-24
```

C'est correct mais trop générique. Comparez à Framed qui affiche directement le film derrière un spoiler progressif. La mécanique de zoom devrait se *voir* dans le partage.

Recommandation : représenter le zoom dans les glyphes. Exemple :
```
🟫 🟫 🟫 🟫 🟫  (tout flou → zoom max)
🟫 🟫 🟫 🟫 ✅  (dézoome → trouvé au 5e)
```
Ou des emojis qui expriment la progression : 🔍🔍🔍🔍✅

Le share devrait aussi **inclure le titre de l'œuvre après résolution** (pas l'artiste, pour éviter le spoiler, mais le titre intrigue). "J'ai trouvé en 3 essais — La nuit étoilée attendait à l'arrivée."

### L'absence de OG image dynamique spoiler-safe

Il y a une route `/api/share/og-image` dans le code. Est-elle utilisée en production ? Si l'OG image n'est pas configurée dans les métadonnées, les liens partagés sur Twitter/WhatsApp affichent un aperçu générique. 

Recommandation : générer une OG image dynamique par date qui montre **le premier crop flou de l'image** (pas la solution) avec le titre "Who Painted This? · 24 mai" et les glyphes du joueur. C'est le visuel qui donne envie de cliquer — surtout si le joueur a réussi.

### Distribution : l'Instagram kit est une excellente idée mal exploitée

Le script `generateInstagramKit.mjs` génère tout le contenu en un commande — carrousel progressif, story, caption, hashtags. C'est vraiment bien. Mais la chaîne de publication reste manuelle.

Quick win : **automatiser la publication Instagram via l'API Meta Graph** (accessible avec un compte créateur). Cela peut être déclenché par un cron Vercel au moment de la publication du puzzle du jour. Zéro maintenance additionnelle.

---

## YUKI — Stratège Contenu & SEO

### L'atout majeur : le contenu éducatif post-jeu

Ce qui distingue fondamentalement ce jeu de Wordle, c'est que **chaque partie se termine par une mini-leçon d'histoire de l'art**. Les paragraphes Wikipedia sur l'artiste et l'œuvre, les dates, le musée — c'est un vrai contenu éducatif accessible. C'est ce qui crée une communauté fidèle : les joueurs qui reviennent ne viennent pas juste pour le jeu, ils viennent pour *apprendre quelque chose de nouveau chaque jour*.

Ce positionnement "apprendre en jouant" est très puissant pour l'acquisition organique — mais il n'est pas du tout mis en avant sur la page d'accueil.

### L'archive est une mine SEO inexploitée

La page archive liste les tableaux passés mais de façon minimale — juste une image et une date. Pourtant, chaque puzzle est potentiellement indexable pour des requêtes type :
- "quiz qui a peint la nuit étoilée"  
- "devine le tableau daily game"
- "Vermeer quiz en ligne"
- "Monet painting quiz"

La page `/puzzle/[date]/solution` existe mais n'est accessible qu'après avoir joué. Pour le SEO, ces pages devraient être **publiques et richement indexées** avec le contenu Wikipedia déjà intégré, des balises Open Graph, des données structurées schema.org.

Recommandation : créer une **page artiste** par artiste présent dans le jeu — `/artist/claude-monet` — avec toutes les œuvres du jeu qui lui sont liées, sa biographie, son mouvement. Ces pages deviennent des hubs de contenu qui capturent les recherches "Monet paintings quiz" et renvoient vers le jeu.

### La fréquence quotidienne vs. la capacité de contenu

Avec le pipeline CSV actuel, tu génères en avance une centaine de puzzles. C'est excellent. Mais un risque à anticiper : **l'épuisement du catalogue de tableaux de qualité**. Les œuvres libres de droit sur Wikimedia sont nombreuses mais inégales en qualité photographique et en intérêt pédagogique.

Recommandation : définir une **charte éditoriale** du puzzle — par exemple, jamais deux peintres du même pays deux jours consécutifs, une œuvre non-européenne par semaine, alternance entre peintres très connus (100 de popularité) et moins connus (70-85). C'est une règle que ton script de génération peut appliquer automatiquement en filtrant le CSV.

### Le lien Wikipedia est trop discret

Le lien "learn more about [artist]" est un lien texte discret en bas de section. Pour un jeu dont le core value prop est l'éducation, c'est trop timide. 

Recommandation : présenter le contenu Wikipedia dans un **format "carte de collection"** — une vraie fiche illustrée par artiste, avec mouvement, dates, pays, fait marquant. Quelque chose qu'on a envie de sauvegarder et de partager. Ce format peut générer du partage organique au-delà du puzzle lui-même.

---

## TOM — Product Manager

### Le pipeline de contenu est un vrai avantage compétitif

Tu as quelque chose de très rare pour un side project : une chaîne de production de contenu entièrement automatisée. CSV → génération Wikidata → cache image → Supabase → Instagram kit. La plupart des daily games similaires nécessitent une intervention manuelle quotidienne. Toi, tu peux préparer 100 jours de contenu en une après-midi.

**Ne jamais sacrifier ça.** Toute nouvelle feature doit préserver ce modèle.

### La roadmap priorisée par impact

**Semaine 1 — Quick wins sans risque**

1. **Animer la révélation finale** (Framer Motion déjà intégré — 30min de travail). C'est l'effet viral n°1.
2. **Déplacer "I give up" après 3 tentatives**. Réduit les abandons précoces, augmente le temps passé.
3. **Ajouter une ligne d'accroche sous le titre** sur la page d'accueil. "Un tableau par jour. Deviens incollable."
4. **Activer l'OG image dynamique** dans les métadonnées Next.js (la route existe déjà).

**Mois 1 — Rétention**

5. **Email de rappel quotidien** — formulaire simple + Resend/Loops. Objectif : 500 abonnés le premier mois.
6. **Streak "en danger"** — si l'utilisateur ne joue pas avant 20h, afficher un badge rouge à son prochain retour.
7. **Compteur de complétion mensuel** dans l'archive.
8. **Enrichir les hints avec des exemples** — au lieu de "Movement: Baroque — different", afficher "Baroque (Rembrandt, Vermeer, Rubens)".

**Mois 2-3 — Viralité & croissance**

9. **Pages artiste SEO** — une page par artiste dans la base, avec ses œuvres jouées.
10. **Mode "Expert"** débloquable après 5 puzzles complétés (7 essais, zoom plus agressif).
11. **Automatiser la publication Instagram** via Meta Graph API.
12. **"Daily Art Digest"** — email hebdomadaire récapitulatif des 7 tableaux de la semaine avec les stats communautaires.

**Long terme — Si ça décolle**

13. Rebranding + nom court (si le trafic le justifie).
14. Pages de collection par mouvement artistique (Impressionnisme, Baroque...).
15. Mode multijoueur asynchrone ("Défie un ami sur ce tableau").

### Un bug à corriger maintenant

La route `/api/puzzle/guess` ne vérifie pas le nombre de tentatives côté serveur. Le paramètre `attemptsUsed` vient du client — un joueur motivé peut soumettre une 6e tentative manuellement. Ça n'est pas critique (le jeu n'a pas de classement compétitif) mais ça fausse les stats communautaires.

---

## Synthèse collective

Ce jeu est **dans le top 5% des daily games indépendants** que nous avons analysés. La mécanique principale est originale et mémorable. Le pipeline de contenu est une prouesse d'ingénierie frugale. Le positionnement éducatif est authentique et différenciant.

Ce qui manque pour passer de "jeu sympa qu'on oublie" à "rituel quotidien" tient essentiellement à **la rétention** : sans notification, sans streak dramatisée, sans email — les joueurs satisfaits ne reviennent pas le lendemain, non par désintérêt, mais par oubli.

Les daily games explosent toujours par la même mécanique : **un partage social qui donne envie + un système qui ramène les joueurs le lendemain**. Wordle avait les deux. Ce jeu a à moitié le premier (le share text existe) et rien du second.

La bonne nouvelle : tout ça est implémentable en quelques semaines sans toucher à l'architecture.

---

*Revue produite par le Collège d'Experts · Who Painted This? · Mai 2026*
