import React, { useEffect, useState } from 'react';


const ImageDatasetInfo = (props) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
      }, []);
    
    const fetchData = async () => {
        try {
          const url = 'https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/experimental_imaging_dataset/' + props.uuid
          const response = await fetch(url, {method: 'GET', mode:"no-cors", headers: {"Content-Type": "application/json"}}); // Replace with your API endpoint
          if (!response.ok) {
            throw new Error('Network response was not ok.');
          }
          const data = await response.json();
          setData(data);
          setLoading(false);
        } catch (error) {
          setError(error.message);
          setLoading(false);
        }
      };
      if (loading) {
        return (
            <section className="vf-content | embl-grid | embl-grid--has-centered-content">
                <div>
                    <h3>Dataset</h3>
                </div>
                <div>
                    No Data
                </div>
            </section> 

        )
        } else if (error) {
            return (
                <section className="vf-content | embl-grid | embl-grid--has-centered-content">
                    <div>
                        <h3>Dataset</h3>
                    </div>
                    <div>
                        {error}
                    </div>
                </section> 
            )
      } else {
        console.log(data)
        return FormatDataset(data)
      }
      
  };




function FormatDataset(dataset) {
    console.log(dataset)
    return (
    <section className="vf-content | embl-grid | embl-grid--has-centered-content">
            <div>
                <h3>Dataset</h3>
            </div>
            <div>
                <b>Title</b>: {dataset.title_id}<br/>
                <b>Description:</b> {dataset.description}<br/>
            </div> 
        </section> 
    );
}

export default ImageDatasetInfo;