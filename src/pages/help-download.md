---
title: Downloading data
layout: ../layouts/HelpLayout.astro
---

Data of submission in the BioImage Archive can be downloaded via web browser, ftp or Aspera.  All three methods are explained below. We recommend ftp or Aspera for large download sizes.
## Downloading via web browser

Data of a submission can be downloaded via a web browser. First, go to the web page of the specific submission you want to download. Select individual files you like and download by clicking the download button. Otherwise, use the “Download all files” button without selecting any files.

You can also download files that belong to a particular study component of a submission.

## Downloading via ftp

The BioImage Archive FTP path is `ftp://ftp.ebi.ac.uk/biostudies`. Anonymous downloads are enabled. For each study, you can click on the FTP button to access it. You can also use your favourite FTP client such as FileZilla to download a study from `ftp://ftp.ebi.ac.uk/biostudies/<mode>/<path>`, where:

`<mode>` is the storage mode and can be either fire or nfs

`<path>` is the path of the accession as described above

All data files for a study are in the ftp://ftp.ebi.ac.uk/biostudies/mode/path/Files directory, e.g., to download the file STAN0B0F6_2022-02-25.tiff from S-BIAD570, you can use the command line

    $ wget ftp://ftp.ebi.ac.uk/biostudies/fire/S-BIAD/570/S-BIAD570/Files/STAN0B0F6_2022-02-25.tiff

<br>
or, for interactive access:

    $ ftp ftp.ebi.ac.uk Name: anonymous ftp> cd biostudies/fire/S-BIAD/570/S-BIAD570/Files/ ftp> get STAN0B0F6_2022-02-25.tiff 

<br>
You can get the FTP link for a study from the /info REST API endpoint, e.g.,

    $ curl https://www.ebi.ac.uk/biostudies/api/v1/studies/S-BIAD570/info -s \| jq -r .ftpLink

## Downloading data via Aspera

When downloading large volumes of data, the Aspera protocol can be useful. You will need to [download the Aspera ascp command line interface](https://www.ibm.com/support/fixcentral/swg/selectFixes?parent=ibm~Other\%20software&product=ibm/Other\%20software/IBM\%20Aspera\%20CLI&release=All&platform=All&function=all). Please select the correct operating system. The ascp command line client is present in the bin folder in the installation directory. Your command for download should be like this:

    ascp -P33001 -i <key> bsaspera@fasp-beta.ebi.ac.uk:<files to download> <download location on your machine>

where:

* `-P33001` and `bsaspera@fasp-beta.ebi.ac.uk` define the port, user and server for the Aspera connection.
* `<key>` is the public key for the Aspera connection which has the value `<aspera cli installation directory>/etc/asperaweb_id_dsa.openssh` for Linux/MacOS and `<aspera cli installation directory>\etc\asperaweb_id_dsa.openssh` for Windows.
* `<files to download>` might be all files for a certain study, as explained above. Please note that Aspera paths do not need to have pub as the root folder.

For instance, here's the command line to download the file `aeipf_denoised_reads.fna` from submission `S-BSST12` to the directory `C:\Temp` on Windows:

    "C:\cli\bin\ascp.exe" -P33001 -i "C:\cli\etc\asperaweb_id_dsa.openssh" bsaspera@fasp-beta.ebi.ac.uk:/S-BSST/012/S-BSST12/Files/aeipf_denoised_reads.fna C:\Temp\

## Downloading data using Globus

The BioImage Archive supports file downloads through Globus as well. You can click on the Globus icon to open up the [EMBL-EBI Public Data collection](https://app.globus.org/file-manager?origin_id=47772002-3e5b-4fd3-b97c-18cee38d6df2&origin_path=%2Fbiostudies%2F) in the Globus File Manager app. You may want to install [Globus Connect Personal](https://www.globus.org/globus-connect-personal) which creates a personal collection on your machine for [transferring multiple files](https://docs.globus.org/how-to/get-started/).