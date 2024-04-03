---
layout: ../layouts/HelpLayout.astro
title: File List guide
---
## File List Guide
<style>
    figure {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        row-gap: 5px;
        border: 1px solid lightgray;
        border-radius: 5px;
        width: 400px;
    }

    figcaption {
        font-style: italic;
        padding: 0 1rem 0 1rem;
        text-align: center;
    }
</style>


### Summary

A File List is used to describe all the files that you wish to include in your submission, both image files and other supporting files e.g., analysis results. It contains file level metadata.

You must have one file list per <a href="rembihelpexamples">study component</a> and one file list per annotations section (if applicable).

* File lists are tabular data, either in tsv or Excel (.xlsx) format. 
* The first column of the header has to be the word "Files".
* It has to have one file per line.
* Do not leave blank lines.
* Filenames are case-sensitive.
* File path separator must be forward slash "/".
* Some special characters are not allowed (see [below](#namerules)). 

### A File List Generator Tool

You can now generate a file list of everything within a given directory under your user space with one click. We have developed a file list generator that is displayed next to every directory in your user space, under the File Upload tab (marked with red in the figure below). Please note that this tool only provides the paths and names of the files in a given directory (recursively, i.e. lists all the files in all sub-directories within that directory). You'd still need to add any relevant metadata yourself. 

<figure class="center margin-bottom-large margin-right-large" style="width: 550px">
  <img src="/src/assets/bioimage-archive/filelist_generator.png" alt="filelist generator">
</figure>

### Detailed Help

A File List is used to describe all the files that you wish to include in your submission, both image files and other supporting files e.g., analysis results. The file list also allows you to specify file level metadata, i.e. attributes associated with each file.

<figure class="float-right margin-left-large" >
<img src="/src/assets/bioimage-archive/filelist.png" alt="file list">
  <figcaption class="figure-caption">An example file list</figcaption>
</figure>

File lists are tabular data, and can be uploaded either in tsv or Excel (.xlsx) format. Unless it is generated programmatically, we recommend editing using a spreadsheet software (Google Sheets, Excel, LibreOffice), and then exporting as tsv and uploading the export.

The first line will be the File List's header. The first column of the header has to be the word "Files". Values for other header columns are not predefined; we recommend using descriptive, self-explanatory names. Some examples of column names:

* For compound treatment experiments: Compound, Concentration, Time  (<a href="https://docs.google.com/spreadsheets/d/1Pj-JTXytPCw7p4-oBEg5MCdpbHZ6DbyVsHS6dx3zzcI/edit?usp=sharing" target="_blank">Example File List</a>)
* For genetic variation studies: Gene Identifier, Gene Symbol (<a href="https://docs.google.com/spreadsheets/d/1jMPOj9cZnU_0DUXwAU-wndcKOQxziqHD5WRdw3mVZCc/edit?usp=sharing" target="_blank">Example File List</a>)
* For antibody reagent studies: Antibody Name, Antibody ID, Target Protein Name, Target Protein ID (<a href="https://docs.google.com/spreadsheets/d/1wTQHCcXuzWZ_zk9E9dqEvLcveGelnMosUrHF38VXkVk/edit?usp=sharing" target="_blank">Example File List</a>)
* For other high content screening studies: Plate, Well, Field (<a href="https://docs.google.com/spreadsheets/d/1ID-3ZlWjgg7vfnU_UIC1wvwqRG1bF94VnOwbNmAkPz0/edit?usp=sharing" target="_blank">Example File List</a>)
* Other commonly used annotations: Channel, Description, QC info (<a href="https://docs.google.com/spreadsheets/d/1MzogH2NE9ODWyipx3u8h-KWe8zLieDdTSz259VOnWe4/edit?usp=sharing" target="_blank">Example File List</a>)
* **For annotations:** Source Image <i>(mandatory)</i>, Annotation Type, Transformation, Creation Time (<a href="https://docs.google.com/spreadsheets/d/1yeIp2xZsYSii6WEYpCZvGyCjuYChB0Pd/edit?usp=sharing&ouid=114171845103914552186&rtpof=true&sd=true" target="_blank">Example File List</a>)

It is useful to include only attributes that have at least two distinct values for the set of image files you are describing in a particular file list; include values that are constant throughout the submission (e.g., "Organism" being "Homo Sapiens") in the annotation of the study entered via the web form.
You can use the <a href="https://www.ebi.ac.uk/ols/index" target="_blank">Ontology Lookup Service</a> to search and access different biomedical ontologies.

Each submission file should be listed in the file list, one file per line. Use as many lines as there are files in your dataset, and enter the exact filenames in the first column. Please note that filenames are case-sensitive.

Fill in attribute values for each of the image files. Do not leave blank lines.

If you have organised files in your BioStudies home directory in a hierarchy, do not forget to reflect that in the file list. E.g., if you have in your home directory folders "Sample1" and "Sample2", refer to files inside those folders as "Sample1/imageFile1.tif" etc. Please note that the file path separator must be forward slash "/", anything else like "\\" or "\ \\" won't work. Please avoid relative paths (./ or ../) and trailing slashes (e.g. //). 

<figure class="center margin-bottom-large margin-right-large" style="width: 600px">
  <img src="/src/assets/bioimage-archive/flat_and_hierarchical.png" alt="different file structures">
</figure>

You need to have at least one file list per submission. If you have different study components, like different experiments belonging to the same submission, you must have one file list per study component. In this case the file list of that study component would only list the names of files that belong to that study component. There are different ways to arrange your submission into study components if you wish to do so, e.g. by experiments in which you imaged different samples or used different imaging techniques, or by different screens in a high content screening study.

As an example, the file structure below contains both raw data as zarr images and analysis results as tsv files for two different experiments. The submission is divided into two study components: Experiment 1 and Experiment 2, each containing raw and analysis files belonging to that experiment. The submission has two file lists, one for each study component.

<figure class="center margin-bottom-large margin-right-large" style="width: 800px">
  <img src="/src/assets/bioimage-archive/two_experiment_filelist.png" alt="file lists per study component">
</figure>

<!-- The figures below show how that submission looks like on the BioImage Archive. Data files view can be expended (see figure below) and shows all the metadata included in the file lists.
 -->

### <a name="namerules"> Directory and File Name Rules</a>

Some special characters are not allowed in the naming of the files. You can find the list of problematic characters and characters to avoid <a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html" target="_blank">here</a>. In rare cases for very large datasets with over half a million files, which may require sub-grouping of files, the file path may refer to a directory. Please contact us before submitting, if this is the case. When referring to a directory the file path must not end with a slash (it should be e.g. "/mysubmission/mysubdirectory").  

Please avoid trailing spaces (space character at the end of a file name), as we do not support them and trim trailing spaces in the file list. 

Below is a list of **allowed** characters:

 1. Any alphanumeric character (a-z \| A-Z \| 0-9)
 2. Any of the following special characters !-_.*'() 
  *  Exclamation point (!)
  *  Hyphen (-)
  *  Underscore (_)
  *  Period (.)
  *  Asterisk (*)
  *  Single quote (')
  *  Open parenthesis ( ( )
  *  Close parenthesis ( ) )

Please [email us](mailto:bioimage-archive@ebi.ac.uk) if you have any further questions.