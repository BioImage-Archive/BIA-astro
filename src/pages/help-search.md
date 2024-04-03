---
title: Searching the BioImage Archive.
layout: ../layouts/HelpLayout.astro
---

## Searching the BioImage Archive
Use the Search box available in the top-right corner of every page. Enter any words that describe studies you are interested in. For example entering the words <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies?query=confocal+fluorescence+microscopy" target="_blank"> *confocal fluorescence microscopy* </a> ( returns all studies containing any or all three words.<!-- [This does not work at the moment on BIA site] As you start typing, a drop-down list will appear suggesting terms that match. For terms that are in <a href="http://www.ebi.ac.uk/efo" target="_blank">EFO</a> (<a href="http://www.ebi.ac.uk/efo" target="_blank">Experimental Factor Ontology</a> - an EMBL-EBI resource providing systematic descriptions of biological samples and experimental variables), a button will be provided enabling expansion of more specific terms. --> Search terms are retained in the search box, where they can be refined (see the [Advanced search](#advanced-search) section below).

The search results page is a list of matching studies sorted according to relevance. You can change the sorting by using the <i>Sort by</i> selector. Clicking on the title of a study takes you to a more detailed page about that study. If there are many results, they will be split over multiple pages. Links at the bottom of the results allow you to navigate the pages, and links at the left of the results allow you to filter the studies by collection, release date and/or publication resource type.

Within the results any matching search word terms are highlighted. <span class="highlight">Yellow</span> highlighting indicates exact matches, <span class="synonym">green</span> highlighting indicates synonyms, and <span class="efo">peach</span> highlighting indicates more specific matches (e.g. "*pancreatic ductal adenocarcinoma*" as a more specific term for "*adenocarcinoma*"). These more specific terms are from EFO ( the [Experimental Factor Ontology](https://www.ebi.ac.uk/efo/) ).

### Advanced search

Queries are case-insensitive. Each word in the query is treated as a separate term (unless surrounded by double quotes), and by default every result has to contain at least one of the terms. This behaviour can be modified by using boolean operators and brackets; e.g.

- <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies?query=confocal+fluorescence+microscopy" target="_blank">*confocal fluorescence microscopy*</a> returns all studies containing any or all three words
- <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies?query=confocal+OR+fluorescence+OR+microscopy" target="_blank">*confocal OR fluorescence OR microscopy*</a> returns all studies containing any or all three words, i.e it is the same as the previous query
- <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies?query=confocal+AND+fluorescence+AND+microscopy" target="_blank">*confocal AND fluorescence AND microscopy*</a> returns only studies containing all three words in any order
- <a href='https://www.ebi.ac.uk/biostudies/BioImages/studies?query=%22confocal+fluorescence+microscopy%22' target='_blank'>*"confocal fluorescence microscopy"*<a/> returns only studies containing the quoted phrase.
- <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies?query=microscopy+AND+%28fluorescence+OR+confocal%29" target="_blank">*microscopy AND (fluorescence OR confocal)*</a> returns only studies containing the term *microscopy* and either *confocal* and/or *fluorescence*.
- <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies?query=microscopy+AND+NOT+%28fluorescence+OR+confocal%29" target="_blank">*microscopy AND NOT (fluorescence OR confocal)*</a> returns studies containing the term *microscopy* but not *confocal* or *fluorescence*.

Queries containing star or question mark characters are treated separately. A star character will match any combination of zero or more characters, e.g., *leuk\*mia* will match to *leukemia* and *leukaemia*, as well as *leukqwertymia*. A question mark character will match any single characters, e.g., *m?n* will match both *man* and *men*. Matched terms for queries that include wildcards are not highlighted in the results.
