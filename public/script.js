function showMessage(message, isError = false) {
  const popup = document.getElementById("messagePopup");
  popup.textContent = message;
  popup.style.display = "block";
  popup.className = "message-popup"; // Reset to default class

  if (isError) {
    popup.classList.add("error");
  }

  setTimeout(() => {
    popup.style.display = "none";
  }, 3000); // Message disappears after 3 seconds
}

document.addEventListener("DOMContentLoaded", function () {
  fetchModels();

  fetchCollections();

  async function fetchModels() {
    try {
      const response = await fetch("/v1/models");
      if (!response.ok) throw new Error("Failed to fetch models");

      const data = await response.json();
      populateTable(data.data);
    } catch (error) {
      console.error("Error fetching models:", error);
    }
  }

  function fetchCollections() {
    fetch("/api/collections")
      .then((response) => response.json())
      .then((collections) => {
        const collectionSelect = document.getElementById("collection");
        collections.forEach((collection) => {
          let option = new Option(collection.name, collection.name);
          collectionSelect.add(option);
        });
      })
      .catch((error) => console.error("Error fetching collections:", error));
  }

  function populateTable(models) {
    const tableBody = document
      .getElementById("modelsTable")
      .getElementsByTagName("tbody")[0];
    tableBody.innerHTML = ""; // Clear existing rows

    models.forEach((model) => {
      let row = tableBody.insertRow();

      let deleteCell = row.insertCell(0);
      deleteCell.innerHTML = `<span class="delete-icon" data-id="${model.id}">❌</span>`;
      // Populate other cells with model data

      let cell1 = row.insertCell(1);
      cell1.textContent = model.id;

      let cell2 = row.insertCell(2);
      cell2.textContent = model.id.split("/")[1].split("-")[0]; // Vector DB

      let cell3 = row.insertCell(3);
      cell3.textContent = model.id.split("/")[1].split("-")[1]; // Collection

      let cell4 = row.insertCell(4);
      cell4.textContent = model.id.split("/")[1].split("-")[2]; // Embedding Function

      let cell5 = row.insertCell(5);
      cell5.textContent = model.model_details.description;

      let cell6 = row.insertCell(6);
      cell6.textContent = model.model_details.type;

      let cell7 = row.insertCell(7);
      cell7.textContent = model.model_details.max_tokens;

      let cell8 = row.insertCell(8);
      cell8.textContent = model.model_details.endpoint;

      let cell9 = row.insertCell(9);
      cell9.textContent = model.model_details.owner;
    });
  }

  const form = document.getElementById("modelForm");

  form.addEventListener("submit", function (event) {
    event.preventDefault(); // Prevent the default form submission

    const formData = new FormData(form);
    // Convert FormData to JSON
    // This step is necessary if your server expects JSON payload
    const formDataJson = Object.fromEntries(formData.entries());

    submitModelForm(JSON.stringify(formDataJson));
  });

  function submitModelForm(formDataJson) {
    fetch("/v1/models", {
      method: "POST",
      body: formDataJson,
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 409) {
            // Handle unique constraint failure (duplicate model)
            return response.text().then((text) => Promise.reject(text));
          } else {
            // Handle other errors
            return Promise.reject("An error occurred while adding the model.");
          }
        }
        return response.text();
      })
      .then((text) => {
        showMessage("Model added successfully");
        fetchModels();
      })
      .catch((error) => {
        showMessage(error, true);
      });
  }

  function deleteModel(modelId, deleteIcon) {
    console.log("Deleting model:", modelId);

    fetch(`/v1/models/${encodeURIComponent(modelId)}`, {
      method: "DELETE",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          // Remove the row from the table
          let row = deleteIcon.parentNode.parentNode;
          row.parentNode.removeChild(row);
          showMessage("Model deleted successfully");
        } else {
          showMessage("Failed to delete model", true);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        showMessage(error, true);
      });
  }

  document
    .getElementById("modelsTable")
    .addEventListener("click", function (event) {
      if (event.target.classList.contains("delete-icon")) {
        const modelId = event.target.getAttribute("data-id");
        deleteModel(modelId, event.target);
      }
    });
});
