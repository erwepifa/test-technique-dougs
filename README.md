# Test Technique Dougs

API NestJS pour valider l'intégrité des opérations bancaires synchronisées.

---

## Le problème

Dougs récupère les opérations bancaires via des prestataires qui font du scraping. Le souci c'est que le scraping n'est pas fiable à 100% : parfois des opérations sont remontées en double, parfois il en manque.

Pour vérifier que tout est correct, on compare les mouvements synchronisés avec les relevés bancaires du client. Un relevé indique un solde à une date donnée : c'est notre source de vérité.

L'objectif : détecter automatiquement les incohérences et donner au comptable les infos nécessaires pour corriger.

---

## L'API

### POST /movements/validation

**Request :**
```json
{
  "movements": [{ "id": 1, "date": "2024-01-15", "label": "Salaire", "amount": 2500 }],
  "balances": [{ "date": "2024-01-31", "balance": 2500 }]
}
```

**Response OK (200) :**
```json
{ "message": "Accepted" }
```

**Response KO (422) :**
```json
{
  "message": "Validation failed",
  "reasons": [
    {
      "type": "BALANCE_MISMATCH",
      "message": "Écart de solde détecté au 31/01/2024 : attendu 500€, calculé 600€ (différence: +100€)",
      "checkpointDate": "2024-01-31",
      "expectedBalance": 500,
      "calculatedBalance": 600,
      "difference": 100
    }
  ]
}
```

---

## Les types de "reasons"

J'ai défini 3 types de problèmes que l'API peut remonter :

### BALANCE_MISMATCH
Le solde calculé ne correspond pas au relevé bancaire.

```json
{
  "type": "BALANCE_MISMATCH",
  "message": "Écart de solde détecté au 31/01/2024...",
  "checkpointDate": "2024-01-31",
  "expectedBalance": 500,
  "calculatedBalance": 600,
  "difference": 100
}
```

### DUPLICATE_SUSPECTED
Des mouvements semblent être des doublons (même montant, même libellé, dates proches).

```json
{
  "type": "DUPLICATE_SUSPECTED",
  "message": "2 mouvement(s) potentiellement en double...",
  "checkpointDate": "2024-01-31",
  "movements": [
    { "id": 1, "date": "2024-01-15", "label": "Virement client", "amount": 500 },
    { "id": 2, "date": "2024-01-15", "label": "Virement client", "amount": 500 }
  ]
}
```

### MISSING_MOVEMENTS
Il manque des mouvements pour atteindre le solde attendu.

```json
{
  "type": "MISSING_MOVEMENTS",
  "message": "Il manque 250€ de mouvements...",
  "checkpointDate": "2024-01-31",
  "missingAmount": 250,
  "periodStart": "2024-01-01",
  "periodEnd": "2024-01-31"
}
```

Chaque reason contient un `message` lisible directement par le comptable + des données structurées pour un éventuel traitement automatisé.

---

## Comment ça marche

L'algorithme fonctionne période par période :

1. On trie les balances par date
2. Pour chaque période entre deux checkpoints :
   - On récupère les mouvements de cette période
   - On calcule : `solde_précédent + somme_des_mouvements`
   - On compare avec le solde du relevé
3. Si ça ne colle pas :
   - Écart positif → on cherche des doublons potentiels
   - Écart négatif → on signale qu'il manque des mouvements

Pour la détection des doublons, je regarde si des mouvements ont le même montant, un libellé similaire et des dates proches (moins de 7 jours d'écart).

---

## Choix techniques

**Pourquoi 422 et pas 400 ?**
400 c'est pour une requête mal formée. Ici la requête est valide, c'est la validation métier qui échoue. 422 (Unprocessable Entity) est plus approprié.

**Pourquoi arrondir les calculs ?**
JavaScript et les floats, c'est pas une histoire d'amour (`0.1 + 0.2 = 0.30000000000000004`). Je fais un arrondi à 2 décimales pour éviter les faux positifs.

---

## Tester avec Postman

Lancer le serveur : `npm run start:dev`

Créer une requête POST vers `http://localhost:3000/movements/validation` avec le header `Content-Type: application/json`.

### Exemple valide

```json
{
  "movements": [
    { "id": 1, "date": "2024-01-05", "label": "Salaire janvier", "amount": 2800 },
    { "id": 2, "date": "2024-01-08", "label": "Loyer", "amount": -950 },
    { "id": 3, "date": "2024-01-10", "label": "EDF", "amount": -85.50 },
    { "id": 4, "date": "2024-01-12", "label": "Courses Carrefour", "amount": -156.30 },
    { "id": 5, "date": "2024-01-15", "label": "Remboursement Sécu", "amount": 45.00 },
    { "id": 6, "date": "2024-01-18", "label": "Netflix", "amount": -17.99 },
    { "id": 7, "date": "2024-01-22", "label": "Restaurant", "amount": -67.50 },
    { "id": 8, "date": "2024-01-25", "label": "Courses Leclerc", "amount": -89.20 },
    { "id": 9, "date": "2024-01-28", "label": "Virement reçu Pierre", "amount": 150.00 }
  ],
  "balances": [
    { "date": "2024-01-31", "balance": 1628.51 }
  ]
}
```

→ Réponse : `{"message":"Accepted"}`

### Exemple avec doublons

```json
{
  "movements": [
    { "id": 1, "date": "2024-01-05", "label": "Salaire", "amount": 2800 },
    { "id": 2, "date": "2024-01-10", "label": "Virement client ABC", "amount": 350 },
    { "id": 3, "date": "2024-01-10", "label": "Virement client ABC", "amount": 350 },
    { "id": 4, "date": "2024-01-15", "label": "Loyer", "amount": -950 },
    { "id": 5, "date": "2024-01-20", "label": "Courses", "amount": -150 }
  ],
  "balances": [
    { "date": "2024-01-31", "balance": 2050 }
  ]
}
```

→ Réponse : 422 avec détection du doublon sur "Virement client ABC"

### Exemple avec mouvements manquants

```json
{
  "movements": [
    { "id": 1, "date": "2024-01-05", "label": "Salaire", "amount": 2800 },
    { "id": 2, "date": "2024-01-15", "label": "Loyer", "amount": -950 }
  ],
  "balances": [
    { "date": "2024-01-31", "balance": 2500 }
  ]
}
```

→ Réponse : 422 signalant qu'il manque 650€

### Exemple sur plusieurs mois

```json
{
  "movements": [
    { "id": 1, "date": "2024-01-05", "label": "Salaire", "amount": 2800 },
    { "id": 2, "date": "2024-01-15", "label": "Loyer", "amount": -950 },
    { "id": 3, "date": "2024-01-20", "label": "Courses", "amount": -200 },
    { "id": 4, "date": "2024-02-05", "label": "Salaire", "amount": 2800 },
    { "id": 5, "date": "2024-02-15", "label": "Loyer", "amount": -950 },
    { "id": 6, "date": "2024-02-20", "label": "Courses", "amount": -180 }
  ],
  "balances": [
    { "date": "2024-01-31", "balance": 1650 },
    { "date": "2024-02-29", "balance": 3320 }
  ]
}
```

→ Réponse : `{"message":"Accepted"}`

---

## Ce que je n'ai pas fait

- Pas de base de données (l'API est stateless, pas demandé)
- Pas d'authentification (hors scope)
- Pas de Docker (le README suffit pour lancer)

Le focus était sur l'algorithme de validation et la qualité du code.
