# Plas-drinklogboek

Een installeerbare webapp (PWA) om bij te houden wanneer en hoeveel je drinkt en plast.

- Drinken vastleggen: tijdstip, hoeveelheid, soort drank en notitie
- Plassen vastleggen: tijdstip, hoeveelheid (optioneel), aandrang, urineverlies en notitie
- Dagoverzicht met totalen en nachtelijke plasmomenten
- Export als CSV voor je arts, plus reservekopie en terugzetten
- Werkt zonder internet nadat de app een keer is geopend

## Privacy

Je logboek staat alleen in de opslag van de browser op je eigen toestel. De app verstuurt geen gegevens en gebruikt geen analytics of externe diensten. Deze repository bevat alleen de code, nooit je logboek.

Omdat de gegevens alleen op je toestel staan, verdwijnen ze als je de app verwijdert of je browsergegevens wist. Maak daarom af en toe een reservekopie via het tandwiel.

## Lokaal draaien

```bash
python -m http.server 8000
```

Open daarna http://localhost:8000.
