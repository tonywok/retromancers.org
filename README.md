# retromancers.org

A website for the Retromancers Premodern Crew in Columbus, OH.

## Development

This site is built with the GitHub Pages-supported Jekyll stack.

```sh
bundle install
bundle exec jekyll serve
```

The local server runs at <http://localhost:4000>.

## Decklists

Posts can include inline card previews and hover-preview decklists. Card images are loaded from Scryfall; no card images are stored locally. When no printing is specified, previews default to the newest Premodern-era printing Scryfall can find. On touch devices, tapping a card opens a preview dialog with a Scryfall link.

Inline card pop:

```markdown
[[Lightning Bolt]]
```

Inline card pop with different display text:

```markdown
[[Fire // Ice::Fire/Ice]]
```

Specific printings use a Scryfall set code suffix. Add a collector number when the set code is not specific enough.

```markdown
[[Counterspell @7ed]]
[[Card Name @set/collector-number]]
[[Fire // Ice @apc::Fire/Ice]]
```

````markdown
```decklist
# Main Deck

## Creatures
4 Jackal Pup

## Spells
4 Lightning Bolt
2 Counterspell @7ed

## Lands
20 Mountain

# Sideboard

3 Pyroblast
```
````

Subsections are optional. If omitted, card rows render directly under the current `# Main Deck` or `# Sideboard` section.
