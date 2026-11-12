// Identificadores de tipo de entidade do PRC (ISO 14739-1) usados pelo leitor.

export const T = {
  TESS_3D: 172, TESS_3D_Compressed: 173, TESS_Face: 174, TESS_3D_Wire: 175, TESS_Markup: 176,
  MISC_Attribute: 201, MISC_CartesianTransformation: 202, MISC_EntityReference: 203, MISC_MarkupLinkedItem: 204,
  MISC_ReferenceOnPRCBase: 205, MISC_ReferenceOnTopology: 206, MISC_GeneralTransformation: 207,
  RI_BrepModel: 232, RI_Curve: 233, RI_Direction: 234, RI_Plane: 235, RI_PointSet: 236, RI_PolyBrepModel: 237,
  RI_PolyWire: 238, RI_Set: 239, RI_CoordinateSystem: 240,
  ASM_ModelFile: 301, ASM_FileStructure: 302, ASM_FileStructureGlobals: 303, ASM_FileStructureTree: 304,
  ASM_FileStructureTessellation: 305, ASM_FileStructureGeometry: 306, ASM_FileStructureExtraGeometry: 307,
  ASM_ProductOccurence: 310, ASM_PartDefinition: 311, ASM_Filter: 320,
  MKP_View: 501, MKP_Markup: 502, MKP_Leader: 503, MKP_AnnotationItem: 504, MKP_AnnotationSet: 505, MKP_AnnotationReference: 506,
  GRAPH_Style: 701, GRAPH_Material: 702, GRAPH_Picture: 703, GRAPH_TextureApplication: 711, GRAPH_TextureDefinition: 712,
  GRAPH_LinePattern: 721, GRAPH_DottingPattern: 723, GRAPH_HatchingPattern: 724, GRAPH_SolidPattern: 725,
  GRAPH_VPicturePattern: 726, GRAPH_AmbientLight: 731, GRAPH_PointLight: 732, GRAPH_DirectionalLight: 733,
  GRAPH_SpotLight: 734, GRAPH_SceneDisplayParameters: 741, GRAPH_Camera: 742
};
export const REFERENCEABLE = {};
[203, 204, 232, 233, 234, 235, 236, 237, 238, 239, 240, 310, 311, 320, 501, 502, 503, 504, 505, 506,
  701, 702, 711, 712, 721, 723, 724, 725, 726, 731, 732, 733, 734, 741, 742].forEach(function (t) { REFERENCEABLE[t] = 1; });

// Chave textual de um identificador unico de file structure (4 inteiros de 32 bits).
export function uuidKey(a) { return a.join('-'); }
