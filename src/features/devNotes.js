// src/features/devNotes.js
import { doc, updateDoc } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { openModal, showAppAlert } from '../utils/ui-helpers.js';

let currentEditingNoteId = null;

export function renderDevNotes() {
    const container = document.getElementById('dev-notes-list-container');
    if (!AppState.devNotesQueue || AppState.devNotesQueue.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 30px 20px; font-size: 0.95rem; font-style: italic;">Your improvement queue is empty.</div>';
        return;
    }

    const priorityWeight = { 'High': 3, 'Normal': 2, 'Low': 1 };
    const sorted = [...AppState.devNotesQueue].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        if (priorityWeight[a.priority] !== priorityWeight[b.priority]) return priorityWeight[b.priority] - priorityWeight[a.priority];
        return b.id - a.id;
    });

    let html = '';
    sorted.forEach(note => {
        const isEditing = note.id === currentEditingNoteId;
        const isRes = note.status === 'resolved';
        const pColor = note.priority === 'High' ? '#ef4444' : (note.priority === 'Normal' ? '#f59e0b' : '#10b981');
        const pBg = note.priority === 'High' ? '#fef2f2' : (note.priority === 'Normal' ? '#fffbeb' : '#ecfdf5');

        if (isEditing) {
            html += `
            <div style="background: var(--surface-color); border: 1px solid #8b5cf6; padding: 12px; border-radius: 12px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);">
                <textarea id="inline-edit-input-${note.id}" style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; font-family: inherit; font-size: 0.95rem; resize: vertical; margin-bottom: 12px; box-sizing: border-box; background: var(--bg-color); color: var(--text-primary); outline: none;">${note.text}</textarea>
                <div style="display: flex; justify-content: flex-end; gap: 8px;">
                    <button style="padding: 8px 16px; background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 8px; cursor: pointer; font-weight: 600;" onclick="cancelInlineEdit()">Cancel</button>
                    <button style="padding: 8px 16px; background: #8b5cf6; border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: 700;" onclick="saveInlineEdit(${note.id})">Save Edit</button>
                </div>
            </div>
            `;
        } else {
            html += `
            <div style="background: var(--surface-color); border: 1px solid ${isRes ? 'var(--border-color)' : pColor}; border-left: 4px solid ${isRes ? 'var(--border-color)' : pColor}; padding: 12px; border-radius: 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; opacity: ${isRes ? '0.6' : '1'}; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${isRes ? 'var(--text-secondary)' : pColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: ${isRes ? 'var(--text-secondary)' : 'transparent'}; color: white; cursor: pointer; transition: all 0.2s; margin-top: 2px;" onclick="toggleDevNote(${note.id})">
                    ${isRes ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                </div>
                <div style="flex: 1; min-width: 0; cursor: pointer;" onclick="const t = this.querySelector('.note-text'); if(t.style.whiteSpace === 'nowrap') { t.style.whiteSpace = 'normal'; } else { t.style.whiteSpace = 'nowrap'; }">
                    <div class="note-text" style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); text-decoration: ${isRes ? 'line-through' : 'none'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">${note.text}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px; display: flex; gap: 8px; align-items: center;">
                        <span style="background: ${isRes ? 'var(--bg-color)' : pBg}; color: ${isRes ? 'var(--text-secondary)' : pColor}; padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${note.priority}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                    <button style="background: none; border: none; color: var(--accent-color); cursor: pointer; padding: 4px; border-radius: 8px;" onclick="editDevNote(${note.id})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; border-radius: 8px;" onclick="deleteDevNote(${note.id})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
            `;
        }
    });
    container.innerHTML = html;
}

export function openDevNotes() {
    renderDevNotes();
    openModal('modal-dev-notes');
}

export async function syncDevNotes() {
    if (!AppState.currentUser) return;
    try {
        await updateDoc(doc(db, 'users', AppState.currentUser.uid), { devNotesQueue: AppState.devNotesQueue }, { merge: true });
    } catch(e) {
        showAppAlert("Sync Error", "Could not sync notes to the cloud.");
    }
}

export async function addDevNote() {
    const text = document.getElementById('dev-note-input').value.trim();
    const priority = document.getElementById('dev-note-priority').value;
    if (!text) return;

    const newNote = {
        id: Date.now(),
        text: text,
        priority: priority,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    AppState.devNotesQueue.push(newNote);
    document.getElementById('dev-note-input').value = '';
    
    renderDevNotes();
    await syncDevNotes();
}

export function editDevNote(id) {
    currentEditingNoteId = id;
    renderDevNotes();
}

export function cancelInlineEdit() {
    currentEditingNoteId = null;
    renderDevNotes();
}

export async function saveInlineEdit(id) {
    const textArea = document.getElementById(`inline-edit-input-${id}`);
    if (!textArea) return;
    
    const note = AppState.devNotesQueue.find(n => n.id === id);
    if (note) {
        note.text = textArea.value.trim();
    }
    
    currentEditingNoteId = null;
    renderDevNotes();
    await syncDevNotes();
}

export async function toggleDevNote(id) {
    const note = AppState.devNotesQueue.find(n => n.id === id);
    if (note) {
        note.status = note.status === 'pending' ? 'resolved' : 'pending';
        renderDevNotes();
        await syncDevNotes();
    }
}

export async function deleteDevNote(id) {
    AppState.devNotesQueue = AppState.devNotesQueue.filter(n => n.id !== id);
    renderDevNotes();
    await syncDevNotes();
}