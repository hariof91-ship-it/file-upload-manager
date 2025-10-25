
js
// public/app.js
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const uploadMsg = document.getElementById('uploadMsg');
const filesListDiv = document.getElementById('filesList');
const refreshBtn = document.getElementById('refreshBtn');

const API_BASE = '/api';

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!fileInput.files.length) {
    uploadMsg.textContent = 'Choose a file first';
    return;
  }
  const file = fileInput.files[0];
  const fd = new FormData();
  fd.append('file', file);
  uploadMsg.textContent = 'Uploading...';

  try {
    const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      uploadMsg.textContent = 'Upload failed: ' + (data.error || JSON.stringify(data));
    } else {
      uploadMsg.textContent = 'Upload success';
      fileInput.value = '';
      loadFiles();
    }
  } catch (err) {
    uploadMsg.textContent = 'Upload error: ' + err.message;
  }
});

refreshBtn.addEventListener('click', loadFiles);

async function loadFiles() {
  filesListDiv.innerHTML = 'Loading...';
  try {
    const res = await fetch(`${API_BASE}/files`);
    const data = await res.json();
    if (!res.ok) {
      filesListDiv.textContent = 'Error: ' + (data.error || JSON.stringify(data));
      return;
    }
    if (!data.files || !data.files.length) {
      filesListDiv.innerHTML = '<i>No files uploaded yet.</i>';
      return;
    }
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr>
      <th>Name</th><th>Size</th><th>Uploaded</th><th>Actions</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    data.files.forEach(f => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      nameTd.textContent = f.originalname || f.filename;
      const sizeTd = document.createElement('td');
      sizeTd.textContent = (f.size || f.length) ? formatBytes(f.size || f.length) : '-';
      const dateTd = document.createElement('td');
      dateTd.textContent = f.uploadDate ? new Date(f.uploadDate).toLocaleString() : (f.uploadDate || '-');
      const actionsTd = document.createElement('td');

      const downloadA = document.createElement('a');
      downloadA.href = f.url;
      downloadA.textContent = 'Download';
      downloadA.style.marginRight = '8px';
      downloadA.setAttribute('download', '');

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = async () => {
        if (!confirm('Delete this file?')) return;
        await deleteFile(f.id);
      };

      actionsTd.appendChild(downloadA);
      actionsTd.appendChild(deleteBtn);

      tr.appendChild(nameTd);
      tr.appendChild(sizeTd);
      tr.appendChild(dateTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    filesListDiv.innerHTML = '';
    filesListDiv.appendChild(table);
  } catch (err) {
    filesListDiv.textContent = 'Error loading files: ' + err.message;
  }
}

async function deleteFile(id) {
  try {
    const res = await fetch(`${API_BASE}/files/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert('Delete failed: ' + (data.error || JSON.stringify(data)));
    } else {
      alert('Deleted');
      loadFiles();
    }
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes) return '-';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// initial load
loadFiles();