import { localStorage, LocalMemory, LocalUser } from './LocalStorage';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER = 'appDataFolder';
const DATA_FILE_NAME = 'diario_data.json';

interface DriveData {
  version: number;
  user: LocalUser;
  memories: LocalMemory[];
  lastUpdated: string;
}

class GoogleDriveSyncService {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Drive API error:', error);
      throw new Error(`Drive API error: ${response.status}`);
    }

    return response;
  }

  // Find the data file in appDataFolder
  private async findDataFile(): Promise<string | null> {
    try {
      const response = await this.fetchWithAuth(
        `${DRIVE_API_BASE}/files?spaces=${APP_FOLDER}&q=name='${DATA_FILE_NAME}'&fields=files(id,name,modifiedTime)`
      );
      const data = await response.json();
      
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error finding data file:', error);
      return null;
    }
  }

  // Download data from Drive
  async downloadData(): Promise<DriveData | null> {
    try {
      const fileId = await this.findDataFile();
      if (!fileId) {
        console.log('No backup file found in Drive');
        return null;
      }

      const response = await this.fetchWithAuth(
        `${DRIVE_API_BASE}/files/${fileId}?alt=media`
      );
      const data = await response.json();
      return data as DriveData;
    } catch (error) {
      console.error('Error downloading data:', error);
      return null;
    }
  }

  // Upload data to Drive
  async uploadData(data: DriveData): Promise<boolean> {
    try {
      const fileId = await this.findDataFile();
      const content = JSON.stringify(data);
      const metadata = {
        name: DATA_FILE_NAME,
        mimeType: 'application/json',
        parents: fileId ? undefined : [APP_FOLDER],
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const body = 
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        closeDelimiter;

      const url = fileId
        ? `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=multipart`
        : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`;

      await this.fetchWithAuth(url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      return true;
    } catch (error) {
      console.error('Error uploading data:', error);
      return false;
    }
  }

  // Sync local data with Drive
  async sync(): Promise<{ success: boolean; message: string }> {
    try {
      const user = await localStorage.getUser();
      if (!user) {
        return { success: false, message: 'No user logged in' };
      }

      // Get local data
      const localMemories = await localStorage.getAllMemoriesIncludingDeleted();
      const unsyncedMemories = localMemories.filter(m => !m.synced);

      // Get remote data
      const remoteData = await this.downloadData();

      if (!remoteData) {
        // First sync - upload everything
        const dataToUpload: DriveData = {
          version: 1,
          user,
          memories: localMemories.filter(m => !m.deleted),
          lastUpdated: new Date().toISOString(),
        };

        const uploaded = await this.uploadData(dataToUpload);
        if (uploaded) {
          await localStorage.markMemoriesAsSynced(localMemories.map(m => m.id));
          await localStorage.setLastSync(new Date().toISOString());
          return { success: true, message: 'Primeiro backup realizado!' };
        }
        return { success: false, message: 'Erro ao fazer backup' };
      }

      // Merge local and remote data
      const mergedMemories = this.mergeMemories(localMemories, remoteData.memories);

      // Upload merged data
      const dataToUpload: DriveData = {
        version: 1,
        user,
        memories: mergedMemories.filter(m => !m.deleted),
        lastUpdated: new Date().toISOString(),
      };

      const uploaded = await this.uploadData(dataToUpload);
      if (uploaded) {
        // Update local with merged data
        await localStorage.importMemories(mergedMemories);
        await localStorage.markMemoriesAsSynced(mergedMemories.map(m => m.id));
        await localStorage.setLastSync(new Date().toISOString());
        return { success: true, message: 'Sincronizado com sucesso!' };
      }

      return { success: false, message: 'Erro ao sincronizar' };
    } catch (error) {
      console.error('Sync error:', error);
      return { success: false, message: 'Erro na sincronização' };
    }
  }

  // Merge local and remote memories
  private mergeMemories(local: LocalMemory[], remote: LocalMemory[]): LocalMemory[] {
    const memoryMap = new Map<string, LocalMemory>();

    // Add remote memories first
    for (const memory of remote) {
      memoryMap.set(memory.id, { ...memory, synced: true });
    }

    // Merge local memories (local wins if newer)
    for (const memory of local) {
      const existing = memoryMap.get(memory.id);
      if (!existing) {
        memoryMap.set(memory.id, memory);
      } else {
        // Compare timestamps - newer wins
        const localTime = new Date(memory.updatedAt).getTime();
        const remoteTime = new Date(existing.updatedAt).getTime();
        if (localTime > remoteTime) {
          memoryMap.set(memory.id, memory);
        }
      }
    }

    return Array.from(memoryMap.values());
  }

  // Restore from Drive
  async restore(): Promise<{ success: boolean; memoriesCount: number }> {
    try {
      const remoteData = await this.downloadData();
      if (!remoteData) {
        return { success: false, memoriesCount: 0 };
      }

      await localStorage.importMemories(remoteData.memories);
      await localStorage.setLastSync(new Date().toISOString());
      
      return { success: true, memoriesCount: remoteData.memories.length };
    } catch (error) {
      console.error('Restore error:', error);
      return { success: false, memoriesCount: 0 };
    }
  }
}

export const googleDriveSync = new GoogleDriveSyncService();
