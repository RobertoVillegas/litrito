import { createContext, useContext } from 'react'

const MapTilerApiKeyContext = createContext('')

export function MapConfigProvider({
  mapTilerApiKey,
  children,
}: {
  mapTilerApiKey: string
  children: React.ReactNode
}) {
  return (
    <MapTilerApiKeyContext.Provider value={mapTilerApiKey}>
      {children}
    </MapTilerApiKeyContext.Provider>
  )
}

export function useMapTilerApiKey() {
  return useContext(MapTilerApiKeyContext)
}
