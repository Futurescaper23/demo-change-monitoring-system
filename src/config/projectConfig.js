export const projectConfig = {
  productName: "FutureScaping Coastal Change Demo",
  branding: {
    overviewHeroImagePath: "./assets/area8-hero-2026-06-16.png",
    overviewHeroImagePathBySurvey: {
      "2026-03-22": "./assets/area8-hero-2026-04-18.png",
      "2026-04-18": "./assets/area8-hero-2026-04-18.png",
      "2026-06-16": "./assets/area8-hero-2026-06-16.png"
    },
    areaHeroImagesBySurvey: {
      "2026-03-22": {
        area8: "./assets/area8-hero-2026-04-18.png"
      },
      "2026-04-18": {
        area8: "./assets/area8-hero-2026-04-18.png"
      },
      "2026-06-16": {
        area8: "./assets/area8-hero-2026-06-16.png"
      }
    },
    areaHeroArtDirectionBySurvey: {
      "2026-03-22": {
        area8: { position: "62% 49%", scale: 0.84, backdropOpacity: 0, backdropBlur: 0, backdropScale: 1.02 }
      },
      "2026-04-18": {
        area8: { position: "62% 49%", scale: 0.84, backdropOpacity: 0, backdropBlur: 0, backdropScale: 1.02 }
      },
      "2026-06-16": {
        area8: { position: "62% 49%", scale: 0.84, backdropOpacity: 0, backdropBlur: 0, backdropScale: 1.02 }
      }
    },
    panoramaEmbedsBySurvey: {
      "2026-06-16": {
        area8: "https://area-8-panos.netlify.app/"
      }
    }
  },
  data: {
    projectsPath: "./data/demo-projects.json"
  },
  deployment: {
    publicBaseUrl: ""
  },
  defaultState: {
    areaId: "area8",
    sectionId: "A8-01",
    layerKey: "ortho",
    primaryLayerKey: "ortho",
    secondaryLayerKey: "ortho",
    activeTab: "overview"
  },
  navigation: {
    tabs: ["overview", "areas", "weather", "panorama", "volume", "layers", "sections"]
  },
  terminology: {
    survey: "survey round",
    area: "monitoring area",
    aerialLayerClient: "Aerial View",
    aerialLayerTechnical: "orthomosaic",
    elevationLayerClient: "Colour Elevation",
    elevationLayerTechnical: "DSM",
    heightModelClient: "surface height model",
    comparison: "change comparison"
  },
  showAdminTools: true,
  demo: {
    enabled: true,
    visibleAreaIds: ["area8"],
    weatherLocationName: "Monitored Estuary Demo Site"
  }
};

