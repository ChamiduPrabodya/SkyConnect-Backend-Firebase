import { NotificationStore } from './rest-store.mjs';
import { AccountDeletionProcessor } from './account-deletion.mjs';

export function createPrivacyRuntime({ projectId, request, auth, storageBucket, endpoint }) {
  const store = new NotificationStore(projectId, request, endpoint);
  const ignoreMissingAuth = async operation => {
    try { await operation(); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  };
  const processor = new AccountDeletionProcessor({ store,
    disable: async uid => {
      await ignoreMissingAuth(() => auth.updateUser(uid, { disabled: true }));
      await ignoreMissingAuth(() => auth.revokeRefreshTokens(uid));
    },
    deleteAuth: uid => ignoreMissingAuth(() => auth.deleteUser(uid)),
    deleteMedia: async (uid, renew) => {
      if (endpoint) return; // Local emulator: media adapter is tested separately.
      if (!storageBucket) throw new Error('Configure the project Storage bucket name for deletion checks.');
      for (const prefix of [`partners/${uid}/`, `users/${uid}/`]) {
        // Repeatedly drain the first page, preserving unrelated object prefixes.
        for (;;) {
          let page;
          try {
            const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o`);
            url.searchParams.set('prefix', prefix); url.searchParams.set('maxResults', '100');
            url.searchParams.set('versions', 'true');
            page = await request(url);
          } catch (error) { if (error.status === 404) break; throw error; }
          if (!page.items?.length) break;
          for (const object of page.items) {
            await renew();
            const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(object.name)}`);
            url.searchParams.set('ifGenerationMatch', object.generation);
            url.searchParams.set('generation', object.generation);
            try { await request(url, { method: 'DELETE' }); }
            catch (error) { if (error.status !== 404) throw error; }
          }
        }
      }
    },
  });
  return { store, processor };
}
