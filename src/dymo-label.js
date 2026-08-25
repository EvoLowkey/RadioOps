function xmlEscape(value=''){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&apos;');
}

export function normalizeRadioId(value){
  const m=/^WT-(\d{1,2})$/i.exec(String(value??'').trim());
  if(!m) throw new Error('Invalid radio ID');
  const n=Number(m[1]);
  if(n<1||n>40) throw new Error('Invalid radio ID');
  return `WT-${String(n).padStart(2,'0')}`;
}

export function dymoFilename(radioId){
  return `Valet-Radio-HQ-${normalizeRadioId(radioId)}-QR-30336.label`;
}

export function buildDymo30336Label(radioId,token){
  const radio=normalizeRadioId(radioId);
  const secure=String(token??'').trim();
  if(!secure) throw new Error('Secure QR token is required');
  const r=xmlEscape(radio),t=xmlEscape(secure);
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips" MediaType="Default">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Small30336</Id>
  <IsOutlined>false</IsOutlined>
  <PaperName>30336 1 in x 2-1/8 in</PaperName>
  <DrawCommands><RoundRectangle X="0" Y="0" Width="1440" Height="3060" Rx="180" Ry="180" /></DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>BRAND</Name><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /><BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName><Rotation>Rotation0</Rotation><IsMirrored>False</IsMirrored><IsVariable>False</IsVariable><GroupID>-1</GroupID><IsOutlined>False</IsOutlined>
      <HorizontalAlignment>Left</HorizontalAlignment><VerticalAlignment>Middle</VerticalAlignment><TextFitMode>ShrinkToFit</TextFitMode><UseFullFontHeight>True</UseFullFontHeight><Verticalized>False</Verticalized>
      <StyledText><Element><String>VALET RADIO HQ</String><Attributes><Font Family="Arial" Size="6.5" Bold="True" Italic="False" Underline="False" Strikeout="False" /><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /></Attributes></Element></StyledText>
    </TextObject><Bounds X="110" Y="70" Width="1800" Height="300" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>RADIO</Name><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /><BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName><Rotation>Rotation0</Rotation><IsMirrored>False</IsMirrored><IsVariable>True</IsVariable><GroupID>-1</GroupID><IsOutlined>False</IsOutlined>
      <HorizontalAlignment>Right</HorizontalAlignment><VerticalAlignment>Middle</VerticalAlignment><TextFitMode>ShrinkToFit</TextFitMode><UseFullFontHeight>True</UseFullFontHeight><Verticalized>False</Verticalized>
      <StyledText><Element><String>${r}</String><Attributes><Font Family="Arial" Size="10" Bold="True" Italic="False" Underline="False" Strikeout="False" /><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /></Attributes></Element></StyledText>
    </TextObject><Bounds X="2030" Y="50" Width="850" Height="330" />
  </ObjectInfo>
  <ObjectInfo>
    <BarcodeObject>
      <Name>SECURE_QR</Name><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /><BackColor Alpha="255" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName><Rotation>Rotation0</Rotation><IsMirrored>False</IsMirrored><IsVariable>True</IsVariable><GroupID>-1</GroupID><IsOutlined>False</IsOutlined>
      <Text>${t}</Text><Type>QRCode</Type><Size>Small</Size><TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="6" Bold="False" Italic="False" Underline="False" Strikeout="False" /><CheckSumFont Family="Arial" Size="6" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding><ECLevel>0</ECLevel><HorizontalAlignment>Center</HorizontalAlignment><QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject><Bounds X="110" Y="260" Width="1080" Height="1080" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>FOOTER</Name><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /><BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName><Rotation>Rotation0</Rotation><IsMirrored>False</IsMirrored><IsVariable>False</IsVariable><GroupID>-1</GroupID><IsOutlined>False</IsOutlined>
      <HorizontalAlignment>Center</HorizontalAlignment><VerticalAlignment>Middle</VerticalAlignment><TextFitMode>ShrinkToFit</TextFitMode><UseFullFontHeight>True</UseFullFontHeight><Verticalized>False</Verticalized>
      <StyledText><Element><String>SCAN TO CHECK OUT / RETURN</String><Attributes><Font Family="Arial" Size="5.5" Bold="True" Italic="False" Underline="False" Strikeout="False" /><ForeColor Alpha="255" Red="0" Green="0" Blue="0" /></Attributes></Element></StyledText>
    </TextObject><Bounds X="150" Y="1160" Width="2760" Height="190" />
  </ObjectInfo>
</DieCutLabel>`;
}
